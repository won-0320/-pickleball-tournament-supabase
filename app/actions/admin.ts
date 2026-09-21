"use server";

import crypto from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  createAdminSession,
  destroyAdminSession,
  isAdminSession,
} from "@/lib/session/adminSession";
import { parseBracket, type ParseIssue, type RosterTeamDraft } from "@/lib/bracket/parseBracket";
import { teamKey, deriveTeamName } from "@/lib/bracket/teamKey";
import { importBracket, type ImportedTeam } from "@/lib/bracket/importBracket";
import {
  generateRoundRobinMatches,
  generateMatchesForNewTeam,
  summarizeGroups,
  type GroupSummary,
  type RoundRobinMatchDraft,
} from "@/lib/bracket/roundRobin";
import { buildSeedList } from "@/lib/bracket/seeding";
import { buildKnockoutBracket } from "@/lib/bracket/knockoutBracket";
import { commitKnockoutBracket } from "@/lib/bracket/commitKnockoutBracket";
import { computeGroupStandings, type TeamStanding } from "@/lib/standings/standings";
import { getDb } from "@/lib/firebase/admin";
import {
  getActiveTournament,
  tournamentsCol,
  tournamentDoc,
  teamsCol,
  teamDoc,
  matchesCol,
  matchDoc,
} from "@/lib/firebase/collections";
import { commitInChunks, type BatchOp } from "@/lib/firebase/batchWrite";
import {
  resolveDispute as resolveDisputeFlow,
  overrideScore as overrideScoreFlow,
} from "@/lib/matches/scoreFlow";
import { applyCascadingAdvancement } from "@/lib/matches/advancement";
import { autoGenerateKnockoutBracket } from "@/lib/bracket/autoGenerateKnockout";
import type { Match, MatchStage, MatchStatus, Team, TournamentStatus } from "@/types/domain";

export interface AdminLoginState {
  error: string | null;
}

export async function adminLogin(
  _prevState: AdminLoginState,
  formData: FormData
): Promise<AdminLoginState> {
  const password = String(formData.get("password") ?? "").trim();
  const expected = (process.env.ADMIN_PASSWORD ?? "").trim();

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
  teams: RosterTeamDraft[];
  groupMatches: RoundRobinMatchDraft[];
  groupSummaries: GroupSummary[];
  errors: ParseIssue[];
  warnings: ParseIssue[];
}

export async function previewBracket(
  formData: FormData
): Promise<PreviewBracketResult> {
  const empty: Omit<PreviewBracketResult, "authError" | "fileError"> = {
    tournamentName: "",
    teams: [],
    groupMatches: [],
    groupSummaries: [],
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

  const groupSummaries = summarizeGroups(result.teams);
  const warnings = [...result.warnings];
  for (const g of groupSummaries) {
    if (g.teamCount < 2) {
      warnings.push({
        row: 0,
        message: `"${g.division}" 부문 "${g.group}" 조는 팀이 ${g.teamCount}개뿐이라 조별리그 경기가 생성되지 않습니다.`,
      });
    }
  }

  const groupsMap = new Map<string, RosterTeamDraft[]>();
  for (const t of result.teams) {
    const key = `${t.division}::${t.group}`;
    const arr = groupsMap.get(key) ?? [];
    arr.push(t);
    groupsMap.set(key, arr);
  }

  const groupMatches: RoundRobinMatchDraft[] = [];
  for (const teamsInGroup of groupsMap.values()) {
    if (teamsInGroup.length === 0) continue;
    const { division, group } = teamsInGroup[0]!;
    groupMatches.push(
      ...generateRoundRobinMatches(
        division,
        group,
        teamsInGroup.map((t) => ({ key: t.key, teamName: t.teamName }))
      )
    );
  }

  return {
    tournamentName,
    teams: result.teams,
    groupMatches,
    groupSummaries,
    errors: result.errors,
    warnings,
  };
}

export interface CommitBracketPayload {
  tournamentName: string;
  teams: RosterTeamDraft[];
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

  if (!payload.tournamentName || payload.teams.length === 0) {
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
  stage?: MatchStage;
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
  if (filters.stage) {
    matches = matches.filter((m) => m.stage === filters.stage);
  }

  matches.sort(
    (a, b) =>
      a.division.localeCompare(b.division) ||
      a.stage.localeCompare(b.stage) ||
      (a.roundIndex ?? 0) - (b.roundIndex ?? 0) ||
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
    match.teamAId ? teamDoc(tournament.id, match.teamAId).get() : Promise.resolve(null),
    match.teamBId ? teamDoc(tournament.id, match.teamBId).get() : Promise.resolve(null),
  ]);

  return { match, teamA: teamASnap?.data(), teamB: teamBSnap?.data() };
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
  await applyCascadingAdvancement(tournament.id, { ...match, ...result.patch });
  if (match.stage === "group") {
    await autoGenerateKnockoutBracket(tournament.id, match.division);
  }
  revalidatePath("/admin/matches");
  revalidatePath(`/admin/matches/${matchId}`);
  revalidatePath("/admin/standings");
  return { error: null };
}

export async function overrideMatchScore(
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

  const result = overrideScoreFlow(match, finalScoreA, finalScoreB, Date.now());
  if (!result.ok) return { error: result.error.message };

  await ref.update(result.patch);
  await applyCascadingAdvancement(tournament.id, { ...match, ...result.patch });
  if (match.stage === "group") {
    await autoGenerateKnockoutBracket(tournament.id, match.division);
  }
  revalidatePath("/admin/matches");
  revalidatePath(`/admin/matches/${matchId}`);
  revalidatePath("/admin/standings");
  return { error: null };
}

export interface GroupStandingsView {
  group: string;
  standings: TeamStanding[];
  totalMatches: number;
  confirmedMatches: number;
  allConfirmed: boolean;
}

export interface DivisionStandingsResult {
  authError?: string;
  error?: string;
  division: string;
  divisions: string[];
  groups: GroupStandingsView[];
  knockoutGenerated: boolean;
}

export async function getDivisionStandings(division: string): Promise<DivisionStandingsResult> {
  const admin = await isAdminSession();
  if (!admin) {
    return {
      authError: "관리자 인증이 필요합니다.",
      division,
      divisions: [],
      groups: [],
      knockoutGenerated: false,
    };
  }

  const tournament = await getActiveTournament();
  if (!tournament) {
    return { error: "활성화된 대회가 없습니다.", division, divisions: [], groups: [], knockoutGenerated: false };
  }

  const [teamsSnap, matchesSnap] = await Promise.all([
    teamsCol(tournament.id).get(),
    matchesCol(tournament.id).get(),
  ]);

  const allTeams = teamsSnap.docs.map((d) => d.data());
  const teams = allTeams.filter((t) => t.division === division);
  const allMatches = matchesSnap.docs.map((d) => d.data());
  const divisionMatches = allMatches.filter((m) => m.division === division);
  const groupMatches = divisionMatches.filter((m) => m.stage === "group");
  const knockoutGenerated = divisionMatches.some((m) => m.stage === "knockout");

  const standingsByGroup = computeGroupStandings(teams, groupMatches);

  const groups: GroupStandingsView[] = Array.from(standingsByGroup.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([group, standings]) => {
      const matchesInGroup = groupMatches.filter((m) => m.group === group);
      const confirmedMatches = matchesInGroup.filter((m) => m.status === "confirmed").length;
      return {
        group,
        standings,
        totalMatches: matchesInGroup.length,
        confirmedMatches,
        allConfirmed: confirmedMatches === matchesInGroup.length,
      };
    });

  return {
    division,
    divisions: Array.from(new Set(allTeams.map((t) => t.division))).sort(),
    groups,
    knockoutGenerated,
  };
}

export interface GenerateBracketResult {
  error?: string;
  warnings?: string[];
  matchCount?: number;
}

export async function generateKnockoutBracket(
  division: string,
  advanceCount: number
): Promise<GenerateBracketResult> {
  const admin = await isAdminSession();
  if (!admin) return { error: "관리자 인증이 필요합니다." };

  if (!Number.isInteger(advanceCount) || advanceCount < 1) {
    return { error: "진출 인원수는 1 이상의 정수여야 합니다." };
  }

  const tournament = await getActiveTournament();
  if (!tournament) return { error: "활성화된 대회가 없습니다." };

  const matchesSnap = await matchesCol(tournament.id).get();
  const allMatches = matchesSnap.docs.map((d) => d.data());
  const divisionMatches = allMatches.filter((m) => m.division === division);

  if (divisionMatches.some((m) => m.stage === "knockout")) {
    return { error: "이미 이 부문의 토너먼트 대진이 생성되어 있습니다. 재생성은 지원하지 않습니다." };
  }

  const groupMatches = divisionMatches.filter((m) => m.stage === "group");
  const unconfirmed = groupMatches.filter((m) => m.status !== "confirmed");
  if (unconfirmed.length > 0) {
    return {
      error: `조별리그 경기 ${unconfirmed.length}건이 아직 확정되지 않았습니다. 모두 확정한 후 다시 시도해주세요.`,
    };
  }

  const teamsSnap = await teamsCol(tournament.id).get();
  const teams = teamsSnap.docs.map((d) => d.data()).filter((t) => t.division === division);
  if (teams.length === 0) {
    return { error: "이 부문에 등록된 팀이 없습니다." };
  }

  const standingsByGroup = computeGroupStandings(teams, groupMatches);
  const seedsResult = buildSeedList(standingsByGroup, advanceCount);
  if ("error" in seedsResult) return { error: seedsResult.error };

  const bracketResult = buildKnockoutBracket(seedsResult);
  if ("error" in bracketResult) return { error: bracketResult.error };

  const { matchCount } = await commitKnockoutBracket(
    tournament.id,
    division,
    bracketResult,
    Date.now()
  );

  revalidatePath("/admin/standings");
  revalidatePath("/admin/matches");

  return { warnings: bracketResult.warnings, matchCount };
}

export interface TournamentListItem {
  id: string;
  name: string;
  status: TournamentStatus;
  createdAt: number;
  teamCount: number;
  matchCount: number;
}

export async function listTournaments(): Promise<{
  authError?: string;
  tournaments: TournamentListItem[];
}> {
  const admin = await isAdminSession();
  if (!admin) return { authError: "관리자 인증이 필요합니다.", tournaments: [] };

  const snap = await tournamentsCol().get();
  const tournaments = await Promise.all(
    snap.docs.map(async (doc) => {
      const t = doc.data();
      const [teamsSnap, matchesSnap] = await Promise.all([
        teamsCol(t.id).get(),
        matchesCol(t.id).get(),
      ]);
      return {
        id: t.id,
        name: t.name,
        status: t.status,
        createdAt: t.createdAt,
        teamCount: teamsSnap.size,
        matchCount: matchesSnap.size,
      };
    })
  );

  tournaments.sort((a, b) => b.createdAt - a.createdAt);
  return { tournaments };
}

export interface DeleteTournamentState {
  error: string | null;
}

export async function deleteTournament(tournamentId: string): Promise<DeleteTournamentState> {
  const admin = await isAdminSession();
  if (!admin) return { error: "관리자 인증이 필요합니다." };

  await getDb().recursiveDelete(tournamentDoc(tournamentId));

  revalidatePath("/admin/tournaments");
  revalidatePath("/admin/teams");
  revalidatePath("/admin/matches");
  revalidatePath("/admin/standings");

  return { error: null };
}

export interface AddTeamInput {
  division: string;
  group: string;
  player1: string;
  player2: string;
}

export interface AddTeamResult {
  error?: string;
  team?: ImportedTeam;
  matchCount?: number;
}

const TEAM_CODE_LENGTH = 4;

function generateTeamCode(used: Set<string>): string {
  let code: string;
  do {
    code = String(Math.floor(Math.random() * 10 ** TEAM_CODE_LENGTH)).padStart(
      TEAM_CODE_LENGTH,
      "0"
    );
  } while (used.has(code));
  used.add(code);
  return code;
}

export async function addTeam(input: AddTeamInput): Promise<AddTeamResult> {
  const admin = await isAdminSession();
  if (!admin) return { error: "관리자 인증이 필요합니다." };

  const division = input.division.trim();
  const group = input.group.trim();
  const player1 = input.player1.trim();
  const player2 = input.player2.trim();

  if (!division || !group || !player1 || !player2) {
    return { error: "모든 항목을 입력해주세요." };
  }

  const teamName = deriveTeamName(player1, player2);

  const tournament = await getActiveTournament();
  if (!tournament) return { error: "활성화된 대회가 없습니다." };

  const [teamsSnap, matchesSnap] = await Promise.all([
    teamsCol(tournament.id).get(),
    matchesCol(tournament.id).get(),
  ]);
  const allTeams = teamsSnap.docs.map((d) => d.data());
  const allMatches = matchesSnap.docs.map((d) => d.data());

  const knockoutAlready = allMatches.some(
    (m) => m.division === division && m.stage === "knockout"
  );
  if (knockoutAlready) {
    return { error: "토너먼트가 이미 생성된 부문에는 팀을 추가할 수 없습니다." };
  }

  const newKey = teamKey(division, group, teamName);
  const duplicate = allTeams.some(
    (t) => teamKey(t.division, t.group ?? "", t.teamName) === newKey
  );
  if (duplicate) {
    return { error: `"${teamName}" 팀이 이미 같은 조에 등록되어 있습니다.` };
  }

  const groupTeams = allTeams.filter((t) => t.division === division && t.group === group);
  const groupMatches = allMatches.filter(
    (m) => m.division === division && m.group === group && m.stage === "group"
  );
  const startRoundIndex =
    groupMatches.length === 0
      ? 0
      : Math.max(...groupMatches.map((m) => m.roundIndex ?? 0)) + 1;

  const usedCodes = new Set(allTeams.map((t) => t.code));
  const code = generateTeamCode(usedCodes);
  const now = Date.now();

  const ops: BatchOp[] = [];
  const teamRef = teamsCol(tournament.id).doc();
  const team: Team = {
    id: teamRef.id,
    tournamentId: tournament.id,
    code,
    division,
    group,
    teamName,
    player1,
    player2,
    createdAt: now,
  };
  ops.push((batch) => batch.set(teamRef, team));

  const newMatchDrafts = generateMatchesForNewTeam(
    division,
    group,
    groupTeams.map((t) => ({ key: teamKey(t.division, t.group ?? "", t.teamName), teamName: t.teamName })),
    { key: newKey, teamName },
    startRoundIndex
  );

  const teamIdByKey = new Map<string, string>();
  for (const t of groupTeams) {
    teamIdByKey.set(teamKey(t.division, t.group ?? "", t.teamName), t.id);
  }
  teamIdByKey.set(newKey, teamRef.id);

  let matchCount = 0;
  for (const draft of newMatchDrafts) {
    const teamAId = teamIdByKey.get(draft.teamAKey);
    const teamBId = teamIdByKey.get(draft.teamBKey);
    if (!teamAId || !teamBId) continue;

    const matchRef = matchesCol(tournament.id).doc();
    const match: Match = {
      id: matchRef.id,
      tournamentId: tournament.id,
      division,
      stage: "group",
      group,
      round: draft.round,
      roundIndex: draft.roundIndex,
      order: draft.order,
      court: null,
      teamAId,
      teamBId,
      teamAName: draft.teamAName,
      teamBName: draft.teamBName,
      scoreA: null,
      scoreB: null,
      status: "pending",
      submittedBy: null,
      submittedScoreA: null,
      submittedScoreB: null,
      opponentScoreA: null,
      opponentScoreB: null,
      resolvedBy: null,
      isBye: false,
      nextMatchId: null,
      nextMatchSlot: null,
      createdAt: now,
      updatedAt: now,
    };
    ops.push((batch) => batch.set(matchRef, match));
    matchCount += 1;
  }

  if (!tournament.divisions.includes(division)) {
    ops.push((batch) =>
      batch.update(tournamentDoc(tournament.id), {
        divisions: [...tournament.divisions, division].sort(),
      })
    );
  }

  await commitInChunks(ops);

  revalidatePath("/admin/teams");
  revalidatePath("/admin/standings");
  revalidatePath("/admin/matches");

  return {
    team: { id: teamRef.id, code, division, group, teamName, player1, player2 },
    matchCount,
  };
}
