"use server";

import crypto from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  createAdminSession,
  destroyAdminSession,
  isAdminSession,
} from "@/lib/session/adminSession";
import { parseBracket, type MatchDraft, type ParseIssue, type TeamDraft } from "@/lib/bracket/parseBracket";
import { importBracket, type ImportedTeam } from "@/lib/bracket/importBracket";
import { getActiveTournament, teamsCol, teamDoc, matchesCol, matchDoc } from "@/lib/firebase/collections";
import { resolveDispute as resolveDisputeFlow } from "@/lib/matches/scoreFlow";
import type { Match, MatchStatus, Team } from "@/types/domain";

export interface AdminLoginState {
  error: string | null;
}

export async function adminLogin(
  _prevState: AdminLoginState,
  formData: FormData
): Promise<AdminLoginState> {
  const password = String(formData.get("password") ?? "");
  const expected = process.env.ADMIN_PASSWORD ?? "";

  if (!expected) {
    return { error: "서버에 ADMIN_PASSWORD가 설정되어 있지 않습니다." };
  }

  const provided = Buffer.from(password);
  const correct = Buffer.from(expected);
  const matches =
    provided.length === correct.length &&
    crypto.timingSafeEqual(provided, correct);

  if (!matches) {
    return { error: "비밀번호가 올바르지 않습니다." };
  }

  await createAdminSession();
  redirect("/admin/upload");
}

export async function adminLogout(): Promise<void> {
  await destroyAdminSession();
  redirect("/admin/login");
}

export async function requireAdmin(): Promise<void> {
  const ok = await isAdminSession();
  if (!ok) {
    redirect("/admin/login");
  }
}

export interface PreviewBracketResult {
  authError?: string;
  fileError?: string;
  tournamentName: string;
  teams: TeamDraft[];
  matches: MatchDraft[];
  errors: ParseIssue[];
  warnings: ParseIssue[];
}

export async function previewBracket(
  formData: FormData
): Promise<PreviewBracketResult> {
  const empty: Omit<PreviewBracketResult, "authError" | "fileError"> = {
    tournamentName: "",
    teams: [],
    matches: [],
    errors: [],
    warnings: [],
  };

  const admin = await isAdminSession();
  if (!admin) {
    return { ...empty, authError: "관리자 인증이 필요합니다. 다시 로그인해주세요." };
  }

  const tournamentName = String(formData.get("tournamentName") ?? "").trim();
  const file = formData.get("file");

  if (!tournamentName) {
    return { ...empty, fileError: "대회명을 입력해주세요." };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { ...empty, tournamentName, fileError: "대진표 파일을 선택해주세요." };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = parseBracket(buffer);

  return {
    tournamentName,
    teams: result.teams,
    matches: result.matches,
    errors: result.errors,
    warnings: result.warnings,
  };
}

export interface CommitBracketPayload {
  tournamentName: string;
  teams: TeamDraft[];
  matches: MatchDraft[];
}

export interface CommitBracketResult {
  authError?: string;
  tournamentId?: string;
  teams?: ImportedTeam[];
  matchCount?: number;
}

export async function commitBracket(
  payload: CommitBracketPayload
): Promise<CommitBracketResult> {
  const admin = await isAdminSession();
  if (!admin) {
    return { authError: "관리자 인증이 필요합니다. 다시 로그인해주세요." };
  }

  if (!payload.tournamentName || payload.matches.length === 0) {
    return { authError: "업로드할 데이터가 없습니다. 미리보기를 먼저 진행해주세요." };
  }

  const result = await importBracket(payload);
  return {
    tournamentId: result.tournamentId,
    teams: result.teams,
    matchCount: result.matchCount,
  };
}

export interface ActiveTournamentSummary {
  id: string;
  name: string;
  divisions: string[];
}

export interface ListTeamsResult {
  authError?: string;
  tournament: ActiveTournamentSummary | null;
  teams: Team[];
}

export async function listTeams(): Promise<ListTeamsResult> {
  const admin = await isAdminSession();
  if (!admin) {
    return { authError: "관리자 인증이 필요합니다.", tournament: null, teams: [] };
  }

  const tournament = await getActiveTournament();
  if (!tournament) {
    return { tournament: null, teams: [] };
  }

  const snap = await teamsCol(tournament.id).get();
  const teams = snap.docs
    .map((d) => d.data())
    .sort(
      (a, b) =>
        a.division.localeCompare(b.division) || a.teamName.localeCompare(b.teamName)
    );

  return {
    tournament: { id: tournament.id, name: tournament.name, divisions: tournament.divisions },
    teams,
  };
}

export interface ListMatchesFilters {
  division?: string;
  status?: MatchStatus;
}

export interface ListMatchesResult {
  authError?: string;
  tournament: ActiveTournamentSummary | null;
  matches: Match[];
}

export async function listMatches(
  filters: ListMatchesFilters = {}
): Promise<ListMatchesResult> {
  const admin = await isAdminSession();
  if (!admin) {
    return { authError: "관리자 인증이 필요합니다.", tournament: null, matches: [] };
  }

  const tournament = await getActiveTournament();
  if (!tournament) {
    return { tournament: null, matches: [] };
  }

  const snap = await matchesCol(tournament.id).get();
  let matches = snap.docs.map((d) => d.data());

  if (filters.division) {
    matches = matches.filter((m) => m.division === filters.division);
  }
  if (filters.status) {
    matches = matches.filter((m) => m.status === filters.status);
  }

  matches.sort(
    (a, b) =>
      a.division.localeCompare(b.division) ||
      a.round.localeCompare(b.round) ||
      (a.order ?? 0) - (b.order ?? 0)
  );

  return {
    tournament: { id: tournament.id, name: tournament.name, divisions: tournament.divisions },
    matches,
  };
}

export interface AdminMatchResult {
  authError?: string;
  match?: Match;
  teamA?: Team;
  teamB?: Team;
}

export async function getAdminMatch(matchId: string): Promise<AdminMatchResult> {
  const admin = await isAdminSession();
  if (!admin) return { authError: "관리자 인증이 필요합니다." };

  const tournament = await getActiveTournament();
  if (!tournament) return { authError: "활성화된 대회가 없습니다." };

  const matchSnap = await matchDoc(tournament.id, matchId).get();
  const match = matchSnap.data();
  if (!match) return { authError: "경기를 찾을 수 없습니다." };

  const [teamASnap, teamBSnap] = await Promise.all([
    teamDoc(tournament.id, match.teamAId).get(),
    teamDoc(tournament.id, match.teamBId).get(),
  ]);

  return { match, teamA: teamASnap.data(), teamB: teamBSnap.data() };
}

export interface ResolveDisputeState {
  error: string | null;
}

export async function resolveMatchDispute(
  matchId: string,
  finalScoreA: number,
  finalScoreB: number
): Promise<ResolveDisputeState> {
  const admin = await isAdminSession();
  if (!admin) return { error: "관리자 인증이 필요합니다." };

  const tournament = await getActiveTournament();
  if (!tournament) return { error: "활성화된 대회가 없습니다." };

  const ref = matchDoc(tournament.id, matchId);
  const snap = await ref.get();
  const match = snap.data();
  if (!match) return { error: "경기를 찾을 수 없습니다." };

  const result = resolveDisputeFlow(match, finalScoreA, finalScoreB, Date.now());
  if (!result.ok) return { error: result.error.message };

  await ref.update(result.patch);
  revalidatePath("/admin/matches");
  revalidatePath(`/admin/matches/${matchId}`);
  return { error: null };
}
