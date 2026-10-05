import type { Match } from "@/types/domain";

export const LEAGUE_POINTS_PER_WIN = 3; // 승점: 승 3점, 패 0점 (피클볼은 무승부 없음)

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
  leaguePoints: number;
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
 * confirmed, non-bye group matches count. Ranking: 승점 desc -> 승자승
 * among tied teams (see orderLeagueStandings).
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

    const ordered = orderLeagueStandings(Array.from(stats.values()), groupMatches);
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
        leaguePoints: s.wins * LEAGUE_POINTS_PER_WIN,
        rank: i + 1,
      }))
    );
  }

  return result;
}

function pointDiff(s: RawStats): number {
  return s.pointsFor - s.pointsAgainst;
}

/**
 * 순위: 승점 desc -> 승자승. 승점이 같은 팀들끼리의 맞대결 승수로
 * 가르고, 그 안에서 다시 동률인 팀이 남으면 그 팀들끼리만 승자승을 다시
 * 적용한다. 3팀 이상이 서로 물고 물려(순환) 승자승으로 가를 수 없으면
 * 동률 팀 간 경기 득실차 -> 전체 득실차 -> 팀명 순.
 */
function orderLeagueStandings(stats: RawStats[], groupMatches: Match[]): RawStats[] {
  const byWins = [...stats].sort((a, b) => b.wins - a.wins);
  const result: RawStats[] = [];
  let i = 0;
  while (i < byWins.length) {
    let j = i + 1;
    while (j < byWins.length && byWins[j]!.wins === byWins[i]!.wins) j++;
    result.push(...resolveHeadToHead(byWins.slice(i, j), groupMatches));
    i = j;
  }
  return result;
}

function resolveHeadToHead(block: RawStats[], groupMatches: Match[]): RawStats[] {
  if (block.length <= 1) return block;

  const tiedIds = new Set(block.map((s) => s.teamId));
  const mini = new Map<string, { wins: number; diff: number }>();
  for (const s of block) mini.set(s.teamId, { wins: 0, diff: 0 });
  for (const m of groupMatches) {
    if (!tiedIds.has(m.teamAId as string) || !tiedIds.has(m.teamBId as string)) continue;
    const scoreA = m.scoreA as number;
    const scoreB = m.scoreB as number;
    const a = mini.get(m.teamAId as string)!;
    const b = mini.get(m.teamBId as string)!;
    a.diff += scoreA - scoreB;
    b.diff += scoreB - scoreA;
    if (scoreA > scoreB) a.wins += 1;
    else b.wins += 1;
  }

  const sorted = [...block].sort((x, y) => mini.get(y.teamId)!.wins - mini.get(x.teamId)!.wins);
  const separated = mini.get(sorted[0]!.teamId)!.wins !== mini.get(sorted[sorted.length - 1]!.teamId)!.wins;

  if (separated) {
    // 승자승으로 일부라도 갈렸으면, 여전히 같은 팀들끼리만 다시 승자승 적용.
    const result: RawStats[] = [];
    let i = 0;
    while (i < sorted.length) {
      let j = i + 1;
      const w = mini.get(sorted[i]!.teamId)!.wins;
      while (j < sorted.length && mini.get(sorted[j]!.teamId)!.wins === w) j++;
      result.push(...resolveHeadToHead(sorted.slice(i, j), groupMatches));
      i = j;
    }
    return result;
  }

  return sorted.sort((x, y) => {
    const mx = mini.get(x.teamId)!;
    const my = mini.get(y.teamId)!;
    return my.diff - mx.diff || pointDiff(y) - pointDiff(x) || x.teamName.localeCompare(y.teamName);
  });
}
