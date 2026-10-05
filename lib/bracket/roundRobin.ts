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
 *
 * 한 코트에서 순서대로 경기한다고 보고, 라운드 순서와 라운드 안 경기 순서를
 * 다시 배치해 어떤 팀도 연속으로 두 경기를 하지 않게 한다 (arrangeRounds).
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

  const rounds: [RRTeamRef, RRTeamRef][][] = [];
  let arr = list.slice();

  for (let r = 0; r < numRounds; r++) {
    const pairs: [RRTeamRef, RRTeamRef][] = [];
    for (let i = 0; i < half; i++) {
      const a = arr[i];
      const b = arr[size - 1 - i];
      if (a && b) pairs.push([a, b]);
    }
    rounds.push(pairs);

    // Rotate: keep index 0 fixed, rotate everyone else one position clockwise.
    const fixed = arr[0];
    const rest = arr.slice(1);
    const last = rest.pop();
    if (last !== undefined) rest.unshift(last);
    arr = [fixed, ...rest];
  }

  return arrangeRounds(rounds).flatMap((pairs, r) =>
    pairs.map(([a, b], i) => ({
      division,
      group,
      round: `조별리그 ${r + 1}라운드`,
      roundIndex: r,
      order: i + 1,
      teamAKey: a.key,
      teamAName: a.teamName,
      teamBKey: b.key,
      teamBName: b.teamName,
    }))
  );
}

type Pair = [RRTeamRef, RRTeamRef];

function sharedTeams(x: Pair, y: Pair): number {
  return x.filter((t) => t.key === y[0].key || t.key === y[1].key).length;
}

const ARRANGE_SEARCH_LIMIT = 200_000;

/**
 * 라운드 순서와 각 라운드의 첫·마지막 경기를 골라, 라운드 경계에서 앞 경기와
 * 뒤 경기에 같은 팀이 들어가는 횟수(연속 경기)를 최소화한다. 라운드 안의
 * 경기끼리는 원래 겹치는 팀이 없으므로 경계만 보면 된다. 5팀 이상이면 0으로
 * 만들 수 있고, 3·4팀은 구조상 연속 경기를 완전히 없앨 수 없어 최소화만 한다.
 */
export function arrangeRounds(rounds: Pair[][]): Pair[][] {
  if (rounds.length <= 1) return rounds;

  // 라운드마다 가능한 (첫 경기, 마지막 경기) 배치
  const options = rounds.map((pairs) => {
    if (pairs.length === 1) return [pairs];
    const out: Pair[][] = [];
    for (let f = 0; f < pairs.length; f++) {
      for (let l = 0; l < pairs.length; l++) {
        if (f === l) continue;
        const middle = pairs.filter((_, i) => i !== f && i !== l);
        out.push([pairs[f]!, ...middle, pairs[l]!]);
      }
    }
    return out;
  });

  let best: Pair[][] = rounds;
  let bestCost = Infinity;
  let steps = 0;
  const used = new Array(rounds.length).fill(false);
  const path: Pair[][] = [];

  function dfs(cost: number) {
    if (bestCost === 0 || steps++ > ARRANGE_SEARCH_LIMIT || cost >= bestCost) return;
    if (path.length === rounds.length) {
      best = path.slice();
      bestCost = cost;
      return;
    }
    const prev = path[path.length - 1];
    const prevLast = prev?.[prev.length - 1];
    for (let r = 0; r < rounds.length; r++) {
      if (used[r]) continue;
      used[r] = true;
      for (const option of options[r]!) {
        path.push(option);
        dfs(cost + (prevLast ? sharedTeams(prevLast, option[0]!) : 0));
        path.pop();
      }
      used[r] = false;
    }
  }

  dfs(0);
  return best;
}

/**
 * Adds a single new team to a group that already has a round-robin
 * schedule: generates one match against every existing team, without
 * touching any already-generated match. Not woven into the normal
 * "조별리그 N라운드" round structure (that would require regenerating
 * everyone's schedule) — instead labeled as a distinct "추가경기" round at
 * `startRoundIndex`, sorted after every existing round.
 */
export function generateMatchesForNewTeam(
  division: string,
  group: string,
  existingTeams: RRTeamRef[],
  newTeam: RRTeamRef,
  startRoundIndex: number
): RoundRobinMatchDraft[] {
  return existingTeams.map((existing, i) => ({
    division,
    group,
    round: "조별리그 추가경기",
    roundIndex: startRoundIndex,
    order: i + 1,
    teamAKey: existing.key,
    teamAName: existing.teamName,
    teamBKey: newTeam.key,
    teamBName: newTeam.teamName,
  }));
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
