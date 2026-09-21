"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getActiveTournament, teamsCol, teamDoc, matchesCol, matchDoc } from "@/lib/firebase/collections";
import { createTeamSession, destroyTeamSession, getTeamSession } from "@/lib/session/teamSession";
import { submitScore as submitScoreFlow, confirmScore as confirmScoreFlow } from "@/lib/matches/scoreFlow";
import { applyCascadingAdvancement } from "@/lib/matches/advancement";
import { autoGenerateKnockoutBracket } from "@/lib/bracket/autoGenerateKnockout";
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

  const snap = await teamsCol(tournament.id)
    .where("code", "==", code)
    .limit(1)
    .get();

  if (snap.empty) {
    return { error: "코드를 찾을 수 없습니다. 코드를 다시 확인해주세요." };
  }

  const team = snap.docs[0]!.data();
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

  const teamSnap = await teamDoc(session.tournamentId, session.teamId).get();
  const team = teamSnap.data();
  if (!team) {
    return { error: "팀 정보를 찾을 수 없습니다.", matches: [] };
  }

  const [asA, asB] = await Promise.all([
    matchesCol(session.tournamentId).where("teamAId", "==", session.teamId).get(),
    matchesCol(session.tournamentId).where("teamBId", "==", session.teamId).get(),
  ]);
  const matches = [...asA.docs, ...asB.docs].map((d) => d.data());
  matches.sort(
    (a, b) =>
      a.stage.localeCompare(b.stage) ||
      (a.roundIndex ?? 0) - (b.roundIndex ?? 0) ||
      (a.order ?? 0) - (b.order ?? 0)
  );

  return { team, matches };
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

  const [matchSnap, teamSnap] = await Promise.all([
    matchDoc(session.tournamentId, matchId).get(),
    teamDoc(session.tournamentId, session.teamId).get(),
  ]);
  const match = matchSnap.data();
  const team = teamSnap.data();
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
 * Firestore-independent state machine in lib/matches/scoreFlow.ts.
 */
export async function submitMatchScore(
  matchId: string,
  scoreOwn: number,
  scoreOpponent: number
): Promise<ScoreActionState> {
  const session = await getTeamSession();
  if (!session) return { error: "세션이 만료되었습니다. 다시 코드를 입력해주세요." };

  const ref = matchDoc(session.tournamentId, matchId);
  const snap = await ref.get();
  const match = snap.data();
  if (!match) return { error: "경기 정보를 찾을 수 없습니다." };

  let side: MatchSide;
  if (match.teamAId === session.teamId) side = "teamA";
  else if (match.teamBId === session.teamId) side = "teamB";
  else return { error: "이 경기에 참가하는 팀이 아닙니다." };

  const scoreA = side === "teamA" ? scoreOwn : scoreOpponent;
  const scoreB = side === "teamA" ? scoreOpponent : scoreOwn;

  const result = submitScoreFlow(match, side, scoreA, scoreB, Date.now());
  if (!result.ok) return { error: result.error.message };

  await ref.update(result.patch);
  revalidatePath(`/team/${session.teamId}`);
  revalidatePath(`/team/${session.teamId}/match/${matchId}`);
  return { error: null };
}

export async function confirmMatchScore(
  matchId: string,
  scoreOwn: number,
  scoreOpponent: number
): Promise<ScoreActionState> {
  const session = await getTeamSession();
  if (!session) return { error: "세션이 만료되었습니다. 다시 코드를 입력해주세요." };

  const ref = matchDoc(session.tournamentId, matchId);
  const snap = await ref.get();
  const match = snap.data();
  if (!match) return { error: "경기 정보를 찾을 수 없습니다." };

  let side: MatchSide;
  if (match.teamAId === session.teamId) side = "teamA";
  else if (match.teamBId === session.teamId) side = "teamB";
  else return { error: "이 경기에 참가하는 팀이 아닙니다." };

  const scoreA = side === "teamA" ? scoreOwn : scoreOpponent;
  const scoreB = side === "teamA" ? scoreOpponent : scoreOwn;

  const result = confirmScoreFlow(match, side, scoreA, scoreB, Date.now());
  if (!result.ok) return { error: result.error.message };

  await ref.update(result.patch);
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
