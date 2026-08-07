import type { Match } from "@/types/domain";

export interface TeamStanding {
  teamId: string;
  teamName: string;
  group: string;
  played: number;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  pointDiff: number;
  rank: number; // 1-based
}

interface RawStats {
  teamId: string;
  teamName: string;
  group: string;
  played: number;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
}

function isCountableGroupMatch(m: Match): boolean {
  return (
    m.stage === "group" &&
    m.status === "confirmed" &&
    !m.isBye &&
    m.teamAId !== null &&
    m.teamBId !== null &&
    m.scoreA !== null &&
    m.scoreB !== null
  );
}

/**
 * Computes per-group standings from a division's teams + matches. Only
 * confirmed, non-bye group matches count. Ranking: wins desc -> point
 * differential desc -> head-to-head (2-way tie) / mini-league among tied
 * teams (3+-way tie) -> alphabetical team name as a final, documented
 * simplification (does not attempt to resolve a fully circular 3+-way tie).
 */
export function computeGroupStandings(
  teams: { id: string; teamName: string; group: string | null }[],
  matches: Match[]
): Map<string, TeamStanding[]> {
  const countable = matches.filter(isCountableGroupMatch);

  const teamsByGroup = new Map<string, { id: string; teamName: string }[]>();
  for (const t of teams) {
    if (t.group === null) continue;
    const arr = teamsByGroup.get(t.group) ?? [];
    arr.push({ id: t.id, teamName: t.teamName });
    teamsByGroup.set(t.group, arr);
  }

  const result = new Map<string, TeamStanding[]>();

  for (const [group, groupTeams] of teamsByGroup) {
    const teamIds = new Set(groupTeams.map((t) => t.id));
    const stats = new Map<string, RawStats>();
    for (const t of groupTeams) {
      stats.set(t.id, {
        teamId: t.id,
        teamName: t.teamName,
        group,
        played: 0,
        wins: 0,
        losses: 0,
        pointsFor: 0,
        pointsAgainst: 0,
      });
    }

    const groupMatches = countable.filter(
      (m) => teamIds.has(m.teamAId as string) && teamIds.has(m.teamBId as string)
    );

    for (const m of groupMatches) {
      const a = stats.get(m.teamAId as string)!;
      const b = stats.get(m.teamBId as string)!;
      const scoreA = m.scoreA as number;
      const scoreB = m.scoreB as number;
      a.played += 1;
      b.played += 1;
      a.pointsFor += scoreA;
      a.pointsAgainst += scoreB;
      b.pointsFor += scoreB;
      b.pointsAgainst += scoreA;
      if (scoreA > scoreB) {
        a.wins += 1;
        b.losses += 1;
      } else {
        b.wins += 1;
        a.losses += 1;
      }
    }

    const ordered = orderStandings(Array.from(stats.values()), groupMatches);
    result.set(
      group,
      ordered.map((s, i) => ({
        teamId: s.teamId,
        teamName: s.teamName,
        group: s.group,
        played: s.played,
        wins: s.wins,
        losses: s.losses,
        pointsFor: s.pointsFor,
        pointsAgainst: s.pointsAgainst,
        pointDiff: s.pointsFor - s.pointsAgainst,
        rank: i + 1,
      }))
    );
  }

  return result;
}

function pointDiff(s: RawStats): number {
  return s.pointsFor - s.pointsAgainst;
}

function orderStandings(stats: RawStats[], groupMatches: Match[]): RawStats[] {
  const primary = [...stats].sort(
    (a, b) => b.wins - a.wins || pointDiff(b) - pointDiff(a)
  );

  const result: RawStats[] = [];
  let i = 0;
  while (i < primary.length) {
    let j = i + 1;
    while (
      j < primary.length &&
      primary[j]!.wins === primary[i]!.wins &&
      pointDiff(primary[j]!) === pointDiff(primary[i]!)
    ) {
      j++;
    }
    const block = primary.slice(i, j);
    result.push(...resolveTieBlock(block, groupMatches));
    i = j;
  }
  return result;
}

function resolveTieBlock(block: RawStats[], groupMatches: Match[]): RawStats[] {
  if (block.length <= 1) return block;

  if (block.length === 2) {
    const [x, y] = block;
    const headToHead = groupMatches.find(
      (m) =>
        (m.teamAId === x!.teamId && m.teamBId === y!.teamId) ||
        (m.teamAId === y!.teamId && m.teamBId === x!.teamId)
    );
    if (headToHead) {
      const xIsA = headToHead.teamAId === x!.teamId;
      const xScore = xIsA ? (headToHead.scoreA as number) : (headToHead.scoreB as number);
      const yScore = xIsA ? (headToHead.scoreB as number) : (headToHead.scoreA as number);
      if (xScore !== yScore) {
        return xScore > yScore ? [x!, y!] : [y!, x!];
      }
    }
    return [...block].sort((a, b) => a.teamName.localeCompare(b.teamName));
  }

  // 3+-way tie: mini-league using only matches among the tied teams.
  const tiedIds = new Set(block.map((s) => s.teamId));
  const miniMatches = groupMatches.filter(
    (m) => tiedIds.has(m.teamAId as string) && tiedIds.has(m.teamBId as string)
  );
  const mini = new Map<string, { wins: number; diff: number }>();
  for (const s of block) mini.set(s.teamId, { wins: 0, diff: 0 });
  for (const m of miniMatches) {
    const scoreA = m.scoreA as number;
    const scoreB = m.scoreB as number;
    const a = mini.get(m.teamAId as string)!;
    const b = mini.get(m.teamBId as string)!;
    a.diff += scoreA - scoreB;
    b.diff += scoreB - scoreA;
    if (scoreA > scoreB) a.wins += 1;
    else b.wins += 1;
  }

  return [...block].sort((s1, s2) => {
    const m1 = mini.get(s1.teamId)!;
    const m2 = mini.get(s2.teamId)!;
    return m2.wins - m1.wins || m2.diff - m1.diff || s1.teamName.localeCompare(s2.teamName);
  });
}
