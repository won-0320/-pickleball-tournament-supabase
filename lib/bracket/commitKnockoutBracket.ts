import type { DocumentReference } from "firebase-admin/firestore";
import { matchesCol } from "@/lib/firebase/collections";
import { commitInChunks, type BatchOp } from "@/lib/firebase/batchWrite";
import type { KnockoutBracketDraft } from "./knockoutBracket";
import type { Match, MatchSide } from "@/types/domain";

export interface CommitKnockoutBracketResult {
  matchCount: number;
}

/**
 * Writes a pure KnockoutBracketDraft to Firestore: pre-allocates a doc ref
 * for every (roundIndex, slotIndex) so nextMatchId can point forward, then
 * batch-writes every match with its stage/bye/advancement-linkage fields.
 */
export async function commitKnockoutBracket(
  tournamentId: string,
  division: string,
  draft: KnockoutBracketDraft,
  now: number
): Promise<CommitKnockoutBracketResult> {
  const refByKey = new Map<string, DocumentReference<Match>>();

  for (const m of draft.matches) {
    refByKey.set(`${m.roundIndex}:${m.slotIndex}`, matchesCol(tournamentId).doc());
  }

  const ops: BatchOp[] = [];

  for (const m of draft.matches) {
    const ref = refByKey.get(`${m.roundIndex}:${m.slotIndex}`)!;

    const isFinalRound = m.roundIndex === draft.roundCount - 1;
    let nextMatchId: string | null = null;
    let nextMatchSlot: MatchSide | null = null;
    if (!isFinalRound) {
      const nextSlotIndex = Math.floor(m.slotIndex / 2);
      const nextRef = refByKey.get(`${m.roundIndex + 1}:${nextSlotIndex}`);
      if (nextRef) {
        nextMatchId = nextRef.id;
        nextMatchSlot = m.slotIndex % 2 === 0 ? "teamA" : "teamB";
      }
    }

    const match: Match = {
      id: ref.id,
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
    ops.push((batch) => batch.set(ref, match));
  }

  await commitInChunks(ops);

  return { matchCount: draft.matches.length };
}
