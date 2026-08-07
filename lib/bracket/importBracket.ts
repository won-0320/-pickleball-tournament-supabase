import type { WriteBatch } from "firebase-admin/firestore";
import { getDb } from "@/lib/firebase/admin";
import { tournamentsCol, teamsCol, matchesCol } from "@/lib/firebase/collections";
import type { MatchDraft, TeamDraft } from "./parseBracket";
import type { Match, Team, Tournament } from "@/types/domain";

export interface ImportBracketInput {
  tournamentName: string;
  teams: TeamDraft[];
  matches: MatchDraft[];
}

export interface ImportedTeam {
  id: string;
  code: string;
  division: string;
  teamName: string;
  player1: string;
  player2: string;
}

export interface ImportBracketResult {
  tournamentId: string;
  teams: ImportedTeam[];
  matchCount: number;
}

const CODE_LENGTH = 4;
const CHUNK_SIZE = 450; // stay under Firestore's 500 ops/batch limit

function generateCode(used: Set<string>): string {
  let code: string;
  do {
    code = String(Math.floor(Math.random() * 10 ** CODE_LENGTH)).padStart(
      CODE_LENGTH,
      "0"
    );
  } while (used.has(code));
  used.add(code);
  return code;
}

type BatchOp = (batch: WriteBatch) => void;

async function commitInChunks(ops: BatchOp[]): Promise<void> {
  const db = getDb();
  for (let i = 0; i < ops.length; i += CHUNK_SIZE) {
    const batch = db.batch();
    for (const op of ops.slice(i, i + CHUNK_SIZE)) {
      op(batch);
    }
    await batch.commit();
  }
}

/**
 * Commits a parsed bracket to Firestore as a brand-new tournament, and
 * closes any previously active tournament so exactly one stays "active"
 * (and therefore reachable via team codes) at a time.
 */
export async function importBracket(
  input: ImportBracketInput
): Promise<ImportBracketResult> {
  const now = Date.now();
  const usedCodes = new Set<string>();

  const activeSnap = await tournamentsCol().where("status", "==", "active").get();

  const tournamentRef = tournamentsCol().doc();
  const tournamentId = tournamentRef.id;

  const ops: BatchOp[] = [];

  const teamRefs = new Map<string, { id: string; code: string }>();
  const importedTeams: ImportedTeam[] = [];

  for (const draft of input.teams) {
    const ref = teamsCol(tournamentId).doc();
    const code = generateCode(usedCodes);
    teamRefs.set(draft.key, { id: ref.id, code });

    const team: Team = {
      id: ref.id,
      tournamentId,
      code,
      division: draft.division,
      teamName: draft.teamName,
      player1: draft.player1,
      player2: draft.player2,
      createdAt: now,
    };
    ops.push((batch) => batch.set(ref, team));
    importedTeams.push({
      id: ref.id,
      code,
      division: draft.division,
      teamName: draft.teamName,
      player1: draft.player1,
      player2: draft.player2,
    });
  }

  let matchCount = 0;
  for (const draft of input.matches) {
    const teamA = teamRefs.get(draft.teamAKey);
    const teamB = teamRefs.get(draft.teamBKey);
    if (!teamA || !teamB) continue; // defensive: should not happen if drafts are consistent

    const ref = matchesCol(tournamentId).doc();
    const match: Match = {
      id: ref.id,
      tournamentId,
      division: draft.division,
      round: draft.round,
      order: draft.order,
      court: draft.court,
      teamAId: teamA.id,
      teamBId: teamB.id,
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
      createdAt: now,
      updatedAt: now,
    };
    ops.push((batch) => batch.set(ref, match));
    matchCount += 1;
  }

  const divisions = Array.from(new Set(input.teams.map((t) => t.division))).sort();
  const tournament: Tournament = {
    id: tournamentId,
    name: input.tournamentName,
    status: "active",
    divisions,
    createdAt: now,
    bracketUploadedAt: now,
  };
  ops.push((batch) => batch.set(tournamentRef, tournament));

  for (const doc of activeSnap.docs) {
    ops.push((batch) => batch.update(doc.ref, { status: "closed" }));
  }

  await commitInChunks(ops);

  return { tournamentId, teams: importedTeams, matchCount };
}
