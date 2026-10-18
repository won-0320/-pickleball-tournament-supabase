"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  findTeamByCode,
  getActiveTournament,
  getMatch,
  getTeam,
  getTournament,
  listMatches,
  listTeams,
  updateMatch,
  updateMatchIfUnchanged,
} from "@/lib/supabase/repo";
import { createTeamSession, destroyTeamSession, getTeamSession } from "@/lib/session/teamSession";
import {
  submitScore as submitScoreFlow,
  confirmScore as confirmScoreFlow,
  editSubmission as editSubmissionFlow,
  cancelSubmission as cancelSubmissionFlow,
  type ScoreFlowResult,
} from "@/lib/matches/scoreFlow";
import { applyCascadingAdvancement } from "@/lib/matches/advancement";
import { autoGenerateKnockoutBracket } from "@/lib/bracket/autoGenerateKnockout";
import { computeGroupStandings, type TeamStanding } from "@/lib/standings/standings";
import { computePodium, type PodiumEntry } from "@/lib/standings/podium";
import { divisionWait, divisionsNeededFor, type DivisionWait } from "@/lib/matches/divisionOrder";
import type { Match, MatchSide, Team } from "@/types/domain";

export interface JoinState {
  error: string | null;
}

export async function joinWithCode(
  _prevState: JoinState,
  formData: FormData
): Promise<JoinState> {
  const code = String(formData.get("code") ?? "").trim();
  if (!code) {
    return { error: "팀 코드를 입력해주세요." };
  }

  const tournament = await getActiveTournament();
  if (!tournament) {
    return { error: "진행 중인 대회가 없습니다. 관리자에게 문의해주세요." };
  }

  const team = await findTeamByCode(tournament.id, code);
  if (!team) {
    return { error: "코드를 찾을 수 없습니다. 코드를 다시 확인해주세요." };
  }

  await createTeamSession({ tournamentId: tournament.id, teamId: team.id });
  redirect(`/team/${team.id}`);
}

export async function leaveTeamSession(): Promise<void> {
  await destroyTeamSession();
  redirect("/join");
}

/**
 * Re-derives and validates the acting team purely from the signed cookie —
 * never trusts a client-supplied teamId (e.g. from the URL) on its own.
 */
export async function requireTeamSession() {
  const session = await getTeamSession();
  if (!session) {
    redirect("/join");
  }
  return session;
}

export interface MyMatchesResult {
  error?: string;
  team?: Team;
  matches: Match[];
}

export async function getMyMatches(): Promise<MyMatchesResult> {
  const session = await getTeamSession();
  if (!session) {
    return { error: "세션이 만료되었습니다. 다시 코드를 입력해주세요.", matches: [] };
  }

  const team = await getTeam(session.tournamentId, session.teamId);
  if (!team) {
    return { error: "팀 정보를 찾을 수 없습니다.", matches: [] };
  }

  const matches = await listMatches(session.tournamentId, { teamId: session.teamId });
  matches.sort(
    (a, b) =>
      a.stage.localeCompare(b.stage) ||
      (a.roundIndex ?? 0) - (b.roundIndex ?? 0) ||
      (a.order ?? 0) - (b.order ?? 0)
  );

  return { team, matches };
}

export interface MyDivisionView {
  standings: TeamStanding[]; // 내 조 순위
  groupConfirmed: number;
  groupTotal: number;
  groupSchedule: Match[]; // 내 조 조별리그 전체 경기, 진행 순서대로
  podium: PodiumEntry[];
  wait: DivisionWait | null; // 먼저 끝나야 하는 다른 부문 경기가 남아 있으면 안내
}

/** 내 팀이 속한 조의 순위표와 부문 최종 결과(우승 등). 세션 기반이라 인자 없음. */
export async function getMyDivisionView(): Promise<MyDivisionView | null> {
  const session = await getTeamSession();
  if (!session) return null;

  const [tournament, team] = await Promise.all([
    getTournament(session.tournamentId),
    getTeam(session.tournamentId, session.teamId),
  ]);
  if (!team) return null;

  // 이 페이지는 몇 초마다 다시 그려지므로 대회 전체가 아니라 필요한 부문만 읽는다.
  const [teams, allMatches] = await Promise.all([
    listTeams(session.tournamentId, { division: team.division }),
    listMatches(session.tournamentId, { divisions: divisionsNeededFor(team.division) }),
  ]);
  const divisionMatches = allMatches.filter((m) => m.division === team.division);
  const groupMatches = divisionMatches.filter((m) => m.stage === "group");
  const standingsByGroup = computeGroupStandings(teams, groupMatches);
  const isLeague = tournament?.leagueDivisions?.includes(team.division) ?? false;

  const myGroupMatches = groupMatches
    .filter((m) => m.group === team.group)
    .sort((a, b) => (a.roundIndex ?? 0) - (b.roundIndex ?? 0) || (a.order ?? 0) - (b.order ?? 0));
  return {
    groupSchedule: myGroupMatches,
    standings: (team.group && standingsByGroup.get(team.group)) || [],
    groupConfirmed: myGroupMatches.filter((m) => m.status === "confirmed").length,
    groupTotal: myGroupMatches.length,
    podium: computePodium(divisionMatches, standingsByGroup, isLeague),
    wait: divisionWait(team.division, allMatches),
  };
}

export interface MatchDetailResult {
  error?: string;
  match?: Match;
  side?: MatchSide;
  team?: Team;
}

export async function getMyMatch(matchId: string): Promise<MatchDetailResult> {
  const session = await getTeamSession();
  if (!session) {
    return { error: "세션이 만료되었습니다. 다시 코드를 입력해주세요." };
  }

  const [match, team] = await Promise.all([
    getMatch(session.tournamentId, matchId),
    getTeam(session.tournamentId, session.teamId),
  ]);
  if (!match || !team) {
    return { error: "경기 정보를 찾을 수 없습니다." };
  }

  let side: MatchSide;
  if (match.teamAId === session.teamId) side = "teamA";
  else if (match.teamBId === session.teamId) side = "teamB";
  else return { error: "이 경기에 참가하는 팀이 아닙니다." };

  return { match, side, team };
}

export interface ScoreActionState {
  error: string | null;
}

/**
 * scoreOwn/scoreOpponent are always from the acting team's own perspective;
 * this function maps them onto the match's canonical teamA/teamB score
 * fields based on the session-derived side before handing off to the
 * database-independent state machine in lib/matches/scoreFlow.ts.
 */
export async function submitMatchScore(
  matchId: string,
  scoreOwn: number,
  scoreOpponent: number
): Promise<ScoreActionState> {
  const session = await getTeamSession();
  if (!session) return { error: "세션이 만료되었습니다. 다시 코드를 입력해주세요." };

  const match = await getMatch(session.tournamentId, matchId);
  if (!match) return { error: "경기 정보를 찾을 수 없습니다." };

  let side: MatchSide;
  if (match.teamAId === session.teamId) side = "teamA";
  else if (match.teamBId === session.teamId) side = "teamB";
  else return { error: "이 경기에 참가하는 팀이 아닙니다." };

  const scoreA = side === "teamA" ? scoreOwn : scoreOpponent;
  const scoreB = side === "teamA" ? scoreOpponent : scoreOwn;

  const result = submitScoreFlow(match, side, scoreA, scoreB, Date.now());
  if (!result.ok) return { error: result.error.message };

  await updateMatch(session.tournamentId, matchId, result.patch);
  revalidatePath(`/team/${session.teamId}`);
  revalidatePath(`/team/${session.teamId}/match/${matchId}`);
  return { error: null };
}

/**
 * 제출한 팀이 상대 확인 전에 자기 제출을 수정/취소. 읽은 뒤 상대가 먼저
 * 확인했으면 덮어쓰지 않도록 updatedAt이 읽을 때 그대로일 때만 업데이트한다.
 */
async function changeOwnSubmission(
  matchId: string,
  apply: (match: Match, side: MatchSide) => ScoreFlowResult
): Promise<ScoreActionState> {
  const session = await getTeamSession();
  if (!session) return { error: "세션이 만료되었습니다. 다시 코드를 입력해주세요." };

  const match = await getMatch(session.tournamentId, matchId);
  if (!match) return { error: "경기 정보를 찾을 수 없습니다." };

  let side: MatchSide;
  if (match.teamAId === session.teamId) side = "teamA";
  else if (match.teamBId === session.teamId) side = "teamB";
  else return { error: "이 경기에 참가하는 팀이 아닙니다." };

  const result = apply(match, side);
  if (!result.ok) return { error: result.error.message };

  const updated = await updateMatchIfUnchanged(
    session.tournamentId,
    matchId,
    match.updatedAt,
    result.patch
  );
  if (!updated) {
    return { error: "그 사이 상대팀이 점수를 확인했습니다. 화면을 새로고침해주세요." };
  }
  revalidatePath(`/team/${session.teamId}`);
  revalidatePath(`/team/${session.teamId}/match/${matchId}`);
  return { error: null };
}

export async function editMatchSubmission(
  matchId: string,
  scoreOwn: number,
  scoreOpponent: number
): Promise<ScoreActionState> {
  return changeOwnSubmission(matchId, (match, side) => {
    const scoreA = side === "teamA" ? scoreOwn : scoreOpponent;
    const scoreB = side === "teamA" ? scoreOpponent : scoreOwn;
    return editSubmissionFlow(match, side, scoreA, scoreB, Date.now());
  });
}

export async function cancelMatchSubmission(matchId: string): Promise<ScoreActionState> {
  return changeOwnSubmission(matchId, (match, side) => cancelSubmissionFlow(match, side, Date.now()));
}

export async function confirmMatchScore(
  matchId: string,
  scoreOwn: number,
  scoreOpponent: number
): Promise<ScoreActionState> {
  const session = await getTeamSession();
  if (!session) return { error: "세션이 만료되었습니다. 다시 코드를 입력해주세요." };

  const match = await getMatch(session.tournamentId, matchId);
  if (!match) return { error: "경기 정보를 찾을 수 없습니다." };

  let side: MatchSide;
  if (match.teamAId === session.teamId) side = "teamA";
  else if (match.teamBId === session.teamId) side = "teamB";
  else return { error: "이 경기에 참가하는 팀이 아닙니다." };

  const scoreA = side === "teamA" ? scoreOwn : scoreOpponent;
  const scoreB = side === "teamA" ? scoreOpponent : scoreOwn;

  const result = confirmScoreFlow(match, side, scoreA, scoreB, Date.now());
  if (!result.ok) return { error: result.error.message };

  await updateMatch(session.tournamentId, matchId, result.patch);
  await applyCascadingAdvancement(session.tournamentId, { ...match, ...result.patch });
  if (match.stage === "group") {
    await autoGenerateKnockoutBracket(session.tournamentId, match.division);
    revalidatePath("/admin/standings");
    revalidatePath("/admin/matches");
  }
  revalidatePath(`/team/${session.teamId}`);
  revalidatePath(`/team/${session.teamId}/match/${matchId}`);
  return { error: null };
}
