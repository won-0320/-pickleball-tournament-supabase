import { tournamentsCol, teamsCol, matchesCol } from "@/lib/firebase/collections";
import { commitInChunks, type BatchOp } from "@/lib/firebase/batchWrite";
import { generateRoundRobinMatches } from "./roundRobin";
import type { RosterTeamDraft } from "./parseBracket";
import type { Match, Team, Tournament } from "@/types/domain";

export interface ImportBracketInput {
  tournamentName: string;
  teams: RosterTeamDraft[];
}

export interface ImportedTeam {
  id: string;
  code: string;
  division: string;
  group: string;
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

/**
 * Commits a parsed roster to Firestore as a brand-new tournament: creates a
 * team doc per row, then auto-generates every round-robin match within each
 * (division, group) pair. Closes any previously active tournament so
 * exactly one stays "active" (and therefore reachable via team codes) at a
 * time.
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

  const teamRefs = new Map<string, { id: string; name: string; code: string }>();
  const importedTeams: ImportedTeam[] = [];

  for (const draft of input.teams) {
    const ref = teamsCol(tournamentId).doc();
    const code = generateCode(usedCodes);
    teamRefs.set(draft.key, { id: ref.id, name: draft.teamName, code });

    const team: Team = {
      id: ref.id,
      tournamentId,
      code,
      division: draft.division,
      group: draft.group,
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
      group: draft.group,
      teamName: draft.teamName,
      player1: draft.player1,
      player2: draft.player2,
    });
  }

  // Group teams by (division, group) and auto-generate round-robin matches.
  const groups = new Map<string, { division: string; group: string; refs: RRRef[] }>();
  for (const draft of input.teams) {
    const groupKey = `${draft.division}::${draft.group}`;
    const ref = teamRefs.get(draft.key)!;
    const entry = groups.get(groupKey) ?? { division: draft.division, group: draft.group, refs: [] };
    entry.refs.push({ key: draft.key, teamName: draft.teamName, id: ref.id });
    groups.set(groupKey, entry);
  }

  let matchCount = 0;
  for (const { division, group, refs } of groups.values()) {
    const matchDrafts = generateRoundRobinMatches(
      division,
      group,
      refs.map((r) => ({ key: r.key, teamName: r.teamName }))
    );

    for (const draft of matchDrafts) {
      const teamA = teamRefs.get(draft.teamAKey);
      const teamB = teamRefs.get(draft.teamBKey);
      if (!teamA || !teamB) continue; // defensive: should not happen if drafts are consistent

      const ref = matchesCol(tournamentId).doc();
      const match: Match = {
        id: ref.id,
        tournamentId,
        division: draft.division,
        stage: "group",
        group: draft.group,
        round: draft.round,
        roundIndex: draft.roundIndex,
        order: draft.order,
        court: null,
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
        isBye: false,
        nextMatchId: null,
        nextMatchSlot: null,
        createdAt: now,
        updatedAt: now,
      };
      ops.push((batch) => batch.set(ref, match));
      matchCount += 1;
    }
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

interface RRRef {
  key: string;
  teamName: string;
  id: string;
}
