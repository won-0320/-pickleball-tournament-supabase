import { matchDoc } from "@/lib/firebase/collections";
import type { Match } from "@/types/domain";

export interface Winner {
  teamId: string;
  teamName: string;
}

/**
 * Pure: determines the winner of a match that has just become `confirmed`
 * (or is a bye). Returns null if the match isn't in a state with a
 * determinable winner yet.
 */
export function determineWinner(match: Match): Winner | null {
  if (match.isBye) {
    return match.teamAId && match.teamAName
      ? { teamId: match.teamAId, teamName: match.teamAName }
      : null;
  }

  if (
    match.status !== "confirmed" ||
    match.scoreA === null ||
    match.scoreB === null ||
    !match.teamAId ||
    !match.teamBId ||
    !match.teamAName ||
    !match.teamBName
  ) {
    return null;
  }

  return match.scoreA > match.scoreB
    ? { teamId: match.teamAId, teamName: match.teamAName }
    : { teamId: match.teamBId, teamName: match.teamBName };
}

/**
 * Writes a knockout match's winner into the next round's match slot. No-op
 * for group-stage matches or matches with no `nextMatchId` (e.g. the
 * final). Call this after any transition that can produce a `confirmed`
 * knockout match: normal two-sided confirmation, admin dispute resolution,
 * and admin score override.
 */
export async function applyCascadingAdvancement(
  tournamentId: string,
  match: Match
): Promise<void> {
  if (match.stage !== "knockout" || !match.nextMatchId || !match.nextMatchSlot) {
    return;
  }

  const winner = determineWinner(match);
  if (!winner) return;

  const patch =
    match.nextMatchSlot === "teamA"
      ? { teamAId: winner.teamId, teamAName: winner.teamName }
      : { teamBId: winner.teamId, teamBName: winner.teamName };

  await matchDoc(tournamentId, match.nextMatchId).update(patch);
}
