import { insertMatches, newId } from "@/lib/supabase/repo";
import type { KnockoutBracketDraft } from "./knockoutBracket";
import type { Match, MatchSide } from "@/types/domain";

export interface CommitKnockoutBracketResult {
  matchCount: number;
}

/**
 * Writes a pure KnockoutBracketDraft to the database: pre-allocates an id
 * for every (roundIndex, slotIndex) so nextMatchId can point forward, then
 * bulk-inserts every match with its stage/bye/advancement-linkage fields.
 */
export async function commitKnockoutBracket(
  tournamentId: string,
  division: string,
  draft: KnockoutBracketDraft,
  now: number
): Promise<CommitKnockoutBracketResult> {
  const idByKey = new Map<string, string>();

  for (const m of draft.matches) {
    idByKey.set(`${m.roundIndex}:${m.slotIndex}`, newId());
  }

  const matches: Match[] = [];

  for (const m of draft.matches) {
    const id = idByKey.get(`${m.roundIndex}:${m.slotIndex}`)!;

    const isFinalRound = m.roundIndex === draft.roundCount - 1;
    let nextMatchId: string | null = null;
    let nextMatchSlot: MatchSide | null = null;
    if (!isFinalRound) {
      const nextSlotIndex = Math.floor(m.slotIndex / 2);
      const nextId = idByKey.get(`${m.roundIndex + 1}:${nextSlotIndex}`);
      if (nextId) {
        nextMatchId = nextId;
        nextMatchSlot = m.slotIndex % 2 === 0 ? "teamA" : "teamB";
      }
    }

    const match: Match = {
      id,
      tournamentId,
      division,
      stage: "knockout",
      group: null,
      round: m.roundName,
      roundIndex: m.roundIndex,
      order: m.slotIndex,
      court: null,
      teamAId: m.teamAId,
      teamBId: m.teamBId,
      teamAName: m.teamAName,
      teamBName: m.teamBName,
      scoreA: null,
      scoreB: null,
      status: m.isBye ? "confirmed" : "pending",
      submittedBy: null,
      submittedScoreA: null,
      submittedScoreB: null,
      opponentScoreA: null,
      opponentScoreB: null,
      resolvedBy: m.isBye ? "bye" : null,
      isBye: m.isBye,
      nextMatchId,
      nextMatchSlot,
      createdAt: now,
      updatedAt: now,
    };
    matches.push(match);
  }

  await insertMatches(matches);

  return { matchCount: draft.matches.length };
}
