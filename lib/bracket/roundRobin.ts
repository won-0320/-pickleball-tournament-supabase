export interface RRTeamRef {
  key: string;
  teamName: string;
}

export interface RoundRobinMatchDraft {
  division: string;
  group: string;
  round: string; // "조별리그 N라운드"
  roundIndex: number; // 0-based
  order: number; // pairing index within the round (1-based)
  teamAKey: string;
  teamBKey: string;
  teamAName: string;
  teamBName: string;
}

/**
 * Generates a full round-robin schedule for one (division, group) using the
 * circle method: fix one team, rotate the rest each round. Odd team counts
 * are padded with a virtual bye slot (one real team sits out each round).
 * Every pair meets exactly once across `n-1` (even n) or `n` (odd n, padded)
 * rounds.
 */
export function generateRoundRobinMatches(
  division: string,
  group: string,
  teams: RRTeamRef[]
): RoundRobinMatchDraft[] {
  const n = teams.length;
  if (n < 2) return [];

  const isOdd = n % 2 !== 0;
  const list: (RRTeamRef | null)[] = isOdd ? [...teams, null] : [...teams];
  const size = list.length; // always even
  const numRounds = size - 1;
  const half = size / 2;

  const matches: RoundRobinMatchDraft[] = [];
  let arr = list.slice();

  for (let r = 0; r < numRounds; r++) {
    let order = 1;
    for (let i = 0; i < half; i++) {
      const a = arr[i];
      const b = arr[size - 1 - i];
      if (a && b) {
        matches.push({
          division,
          group,
          round: `조별리그 ${r + 1}라운드`,
          roundIndex: r,
          order,
          teamAKey: a.key,
          teamAName: a.teamName,
          teamBKey: b.key,
          teamBName: b.teamName,
        });
        order++;
      }
    }

    // Rotate: keep index 0 fixed, rotate everyone else one position clockwise.
    const fixed = arr[0];
    const rest = arr.slice(1);
    const last = rest.pop();
    if (last !== undefined) rest.unshift(last);
    arr = [fixed, ...rest];
  }

  return matches;
}

export interface GroupSummary {
  division: string;
  group: string;
  teamCount: number;
  matchCount: number;
}

export function summarizeGroups(
  teams: { division: string; group: string }[]
): GroupSummary[] {
  const counts = new Map<string, GroupSummary>();
  for (const t of teams) {
    const key = `${t.division}::${t.group}`;
    const existing = counts.get(key);
    if (existing) {
      existing.teamCount += 1;
    } else {
      counts.set(key, { division: t.division, group: t.group, teamCount: 1, matchCount: 0 });
    }
  }
  for (const summary of counts.values()) {
    const n = summary.teamCount;
    summary.matchCount = n < 2 ? 0 : (n * (n - 1)) / 2;
  }
  return Array.from(counts.values()).sort(
    (a, b) => a.division.localeCompare(b.division) || a.group.localeCompare(b.group)
  );
}
