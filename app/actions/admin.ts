"use server";

import crypto from "crypto";
import { redirect, RedirectType } from "next/navigation";
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
import { buildDivisionKnockout } from "@/lib/bracket/divisionKnockout";
import { commitKnockoutBracket } from "@/lib/bracket/commitKnockoutBracket";
import { computeGroupStandings, type TeamStanding } from "@/lib/standings/standings";
import { computePodium, type PodiumEntry } from "@/lib/standings/podium";
import * as db from "@/lib/supabase/repo";
import {
  resolveDispute as resolveDisputeFlow,
  overrideScore as overrideScoreFlow,
} from "@/lib/matches/scoreFlow";
import { applyCascadingAdvancement } from "@/lib/matches/advancement";
import { autoGenerateKnockoutBracket } from "@/lib/bracket/autoGenerateKnockout";
import { computeMatchOrder } from "@/lib/matches/matchOrder";
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
  redirect("/admin/upload", RedirectType.replace);
}

export async function adminLogout(): Promise<void> {
  await destroyAdminSession();
  redirect("/admin/login", RedirectType.replace);
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

  const tournament = await db.getActiveTournament();
  if (!tournament) {
    return { tournament: null, teams: [] };
  }

  const teams = (await db.listTeams(tournament.id)).sort(
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

  const tournament = await db.getActiveTournament();
  if (!tournament) {
    return { tournament: null, matches: [] };
  }

  let matches = await db.listMatches(tournament.id);

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
  seq?: number; // 조(토너먼트는 부문) 안에서 몇 번째 경기인지
}

export async function getAdminMatch(matchId: string): Promise<AdminMatchResult> {
  const admin = await isAdminSession();
  if (!admin) return { authError: "관리자 인증이 필요합니다." };

  const tournament = await db.getActiveTournament();
  if (!tournament) return { authError: "활성화된 대회가 없습니다." };

  const match = await db.getMatch(tournament.id, matchId);
  if (!match) return { authError: "경기를 찾을 수 없습니다." };

  const [teamA, teamB, divisionMatches] = await Promise.all([
    match.teamAId ? db.getTeam(tournament.id, match.teamAId) : Promise.resolve(null),
    match.teamBId ? db.getTeam(tournament.id, match.teamBId) : Promise.resolve(null),
    db.listMatches(tournament.id, { divisions: [match.division] }),
  ]);
  const { seq } = computeMatchOrder(divisionMatches);

  return {
    match,
    teamA: teamA ?? undefined,
    teamB: teamB ?? undefined,
    seq: seq.get(match.id),
  };
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

  const tournament = await db.getActiveTournament();
  if (!tournament) return { error: "활성화된 대회가 없습니다." };

  const match = await db.getMatch(tournament.id, matchId);
  if (!match) return { error: "경기를 찾을 수 없습니다." };

  const result = resolveDisputeFlow(match, finalScoreA, finalScoreB, Date.now());
  if (!result.ok) return { error: result.error.message };

  await db.updateMatch(tournament.id, matchId, result.patch);
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

  const tournament = await db.getActiveTournament();
  if (!tournament) return { error: "활성화된 대회가 없습니다." };

  const match = await db.getMatch(tournament.id, matchId);
  if (!match) return { error: "경기를 찾을 수 없습니다." };

  const result = overrideScoreFlow(match, finalScoreA, finalScoreB, Date.now());
  if (!result.ok) return { error: result.error.message };

  await db.updateMatch(tournament.id, matchId, result.patch);
  await applyCascadingAdvancement(tournament.id, { ...match, ...result.patch });
  if (match.stage === "group") {
    await autoGenerateKnockoutBracket(tournament.id, match.division);
  }
  revalidatePath("/admin/matches");
  revalidatePath(`/admin/matches/${matchId}`);
  revalidatePath("/admin/standings");
  return { error: null };
}

export async function resetMatch(matchId: string): Promise<ResolveDisputeState> {
  const admin = await isAdminSession();
  if (!admin) return { error: "관리자 인증이 필요합니다." };

  const tournament = await db.getActiveTournament();
  if (!tournament) return { error: "활성화된 대회가 없습니다." };

  const match = await db.getMatch(tournament.id, matchId);
  if (!match) return { error: "경기를 찾을 수 없습니다." };
  if (match.isBye) return { error: "부전승 경기는 초기화할 수 없습니다." };

  let nextSlotReset: { nextMatchId: string; patch: Partial<Match> } | null = null;

  // 토너먼트 경기면 다음 라운드로 올라간 승자도 되돌린다. 다음 경기가 이미
  // 진행됐다면 결과가 꼬이므로 막는다.
  if (match.nextMatchId && match.nextMatchSlot && match.status === "confirmed") {
    const next = await db.getMatch(tournament.id, match.nextMatchId);
    if (next) {
      if (next.status !== "pending") {
        return { error: "다음 라운드 경기가 이미 진행되어 이 경기를 초기화할 수 없습니다. 다음 경기부터 초기화해주세요." };
      }
      const slotPatch =
        match.nextMatchSlot === "teamA"
          ? { teamAId: null, teamAName: null }
          : { teamBId: null, teamBName: null };
      nextSlotReset = {
        nextMatchId: match.nextMatchId,
        patch: { ...slotPatch, updatedAt: Date.now() },
      };
    }
  }

  if (nextSlotReset) {
    await db.updateMatch(tournament.id, nextSlotReset.nextMatchId, nextSlotReset.patch);
  }
  await db.updateMatch(tournament.id, matchId, {
    status: "pending",
    scoreA: null,
    scoreB: null,
    submittedBy: null,
    submittedScoreA: null,
    submittedScoreB: null,
    opponentScoreA: null,
    opponentScoreB: null,
    resolvedBy: null,
    updatedAt: Date.now(),
  });

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
  knockoutPlayedCount: number;
  isLeague: boolean;
  podium: PodiumEntry[];
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
      knockoutPlayedCount: 0,
      isLeague: false,
      podium: [],
    };
  }

  const tournament = await db.getActiveTournament();
  if (!tournament) {
    return {
      error: "활성화된 대회가 없습니다.",
      division,
      divisions: [],
      groups: [],
      knockoutGenerated: false,
      knockoutPlayedCount: 0,
      isLeague: false,
      podium: [],
    };
  }

  const [allTeams, divisionMatches] = await Promise.all([
    db.listTeams(tournament.id),
    db.listMatches(tournament.id, { divisions: [division] }),
  ]);

  const teams = allTeams.filter((t) => t.division === division);
  const groupMatches = divisionMatches.filter((m) => m.stage === "group");
  const knockoutGenerated = divisionMatches.some((m) => m.stage === "knockout");
  const knockoutPlayedCount = divisionMatches.filter(
    (m) => m.stage === "knockout" && !m.isBye && m.status !== "pending"
  ).length;
  const isLeague = tournament.leagueDivisions?.includes(division) ?? false;

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
    knockoutPlayedCount,
    isLeague,
    podium: computePodium(divisionMatches, standingsByGroup, isLeague),
  };
}

export async function setDivisionLeague(
  division: string,
  league: boolean
): Promise<{ error?: string }> {
  const admin = await isAdminSession();
  if (!admin) return { error: "관리자 인증이 필요합니다." };

  const tournament = await db.getActiveTournament();
  if (!tournament) return { error: "활성화된 대회가 없습니다." };

  if (league) {
    const divisionMatches = await db.listMatches(tournament.id, { divisions: [division] });
    const knockoutAlready = divisionMatches.some((m) => m.stage === "knockout");
    if (knockoutAlready) {
      return { error: "이미 토너먼트 대진이 생성된 부문은 리그전으로 바꿀 수 없습니다." };
    }
  }

  const current = tournament.leagueDivisions ?? [];
  const next = league
    ? Array.from(new Set([...current, division])).sort()
    : current.filter((d) => d !== division);
  await db.updateTournament(tournament.id, { leagueDivisions: next });

  // 리그전을 해제했는데 조별리그가 이미 다 끝나 있으면 바로 토너먼트를 생성.
  if (!league) {
    await autoGenerateKnockoutBracket(tournament.id, division);
  }

  revalidatePath("/admin/standings");
  revalidatePath("/admin/matches");
  return {};
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

  const tournament = await db.getActiveTournament();
  if (!tournament) return { error: "활성화된 대회가 없습니다." };

  const divisionMatches = await db.listMatches(tournament.id, { divisions: [division] });

  if (tournament.leagueDivisions?.includes(division)) {
    return { error: "리그전 부문은 토너먼트 대진을 생성하지 않습니다." };
  }

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

  const teams = await db.listTeams(tournament.id, { division });
  if (teams.length === 0) {
    return { error: "이 부문에 등록된 팀이 없습니다." };
  }

  const standingsByGroup = computeGroupStandings(teams, groupMatches);
  const bracketResult = buildDivisionKnockout(standingsByGroup, advanceCount);
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

const REGENERATE_ADVANCE_COUNT = 2; // 자동 생성과 동일: 조 1·2위 진출

/**
 * 이 부문의 기존 토너먼트(결승·3·4위전 포함) 경기를 모두 지우고, 현재
 * 조별리그 순위로 다시 만든다. 조별리그 점수를 고친 뒤 대진을 바로잡는 용도.
 */
export async function regenerateKnockoutBracket(division: string): Promise<GenerateBracketResult> {
  const admin = await isAdminSession();
  if (!admin) return { error: "관리자 인증이 필요합니다." };

  const tournament = await db.getActiveTournament();
  if (!tournament) return { error: "활성화된 대회가 없습니다." };
  if (tournament.leagueDivisions?.includes(division)) {
    return { error: "리그전 부문은 토너먼트 대진을 생성하지 않습니다." };
  }

  const divisionMatches = await db.listMatches(tournament.id, { divisions: [division] });
  const groupMatches = divisionMatches.filter((m) => m.stage === "group");
  const unconfirmed = groupMatches.filter((m) => m.status !== "confirmed");
  if (unconfirmed.length > 0) {
    return {
      error: `조별리그 경기 ${unconfirmed.length}건이 아직 확정되지 않았습니다. 모두 확정한 후 다시 시도해주세요.`,
    };
  }

  const teams = await db.listTeams(tournament.id, { division });
  const standingsByGroup = computeGroupStandings(teams, groupMatches);
  const bracketResult = buildDivisionKnockout(standingsByGroup, REGENERATE_ADVANCE_COUNT);
  if ("error" in bracketResult) return { error: bracketResult.error };

  await db.deleteMatches(
    tournament.id,
    divisionMatches.filter((m) => m.stage === "knockout").map((m) => m.id)
  );

  const { matchCount } = await commitKnockoutBracket(tournament.id, division, bracketResult, Date.now());

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

  const all = await db.listTournaments();
  const tournaments = await Promise.all(
    all.map(async (t) => {
      // 개수만 필요하므로 행을 전부 읽지 않고 count만 받는다.
      const [teamCount, matchCount] = await Promise.all([
        db.countTeams(t.id),
        db.countMatches(t.id),
      ]);
      return {
        id: t.id,
        name: t.name,
        status: t.status,
        createdAt: t.createdAt,
        teamCount,
        matchCount,
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

  await db.deleteTournament(tournamentId);

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

  const tournament = await db.getActiveTournament();
  if (!tournament) return { error: "활성화된 대회가 없습니다." };

  const [allTeams, allMatches] = await Promise.all([
    db.listTeams(tournament.id),
    db.listMatches(tournament.id, { divisions: [division] }),
  ]);

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

  const teamId = db.newId();
  const team: Team = {
    id: teamId,
    tournamentId: tournament.id,
    code,
    division,
    group,
    teamName,
    player1,
    player2,
    createdAt: now,
  };
  const newMatches: Match[] = [];

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
  teamIdByKey.set(newKey, teamId);

  let matchCount = 0;
  for (const draft of newMatchDrafts) {
    const teamAId = teamIdByKey.get(draft.teamAKey);
    const teamBId = teamIdByKey.get(draft.teamBKey);
    if (!teamAId || !teamBId) continue;

    newMatches.push({
      id: db.newId(),
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
    });
    matchCount += 1;
  }

  await db.insertTeams([team]);
  await db.insertMatches(newMatches);
  if (!tournament.divisions.includes(division)) {
    await db.updateTournament(tournament.id, {
      divisions: [...tournament.divisions, division].sort(),
    });
  }

  revalidatePath("/admin/teams");
  revalidatePath("/admin/standings");
  revalidatePath("/admin/matches");

  return {
    team: { id: teamId, code, division, group, teamName, player1, player2 },
    matchCount,
  };
}
