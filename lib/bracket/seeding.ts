import type { TeamStanding } from "@/lib/standings/standings";

export interface SeededTeam {
  seed: number; // 1-based
  teamId: string;
  teamName: string;
  group: string;
}

/**
 * Builds the knockout-stage seed list from group standings: all group
 * winners first (in group order), then all runners-up, then all 3rd-place,
 * etc., up to `advanceCount` per group. Returns an error if any group has
 * fewer teams than `advanceCount`.
 */
export function buildSeedList(
  standingsByGroup: Map<string, TeamStanding[]>,
  advanceCount: number,
  groupOrder?: string[]
): SeededTeam[] | { error: string } {
  const groups =
    groupOrder ?? Array.from(standingsByGroup.keys()).sort((a, b) => a.localeCompare(b));

  for (const group of groups) {
    const standings = standingsByGroup.get(group) ?? [];
    if (standings.length < advanceCount) {
      return {
        error: `"${group}" 조는 진출 인원(${advanceCount}명)보다 팀 수가 적습니다 (팀 ${standings.length}개).`,
      };
    }
  }

  const seeds: SeededTeam[] = [];
  let seedNum = 1;
  for (let place = 0; place < advanceCount; place++) {
    for (const group of groups) {
      const standings = standingsByGroup.get(group)!;
      const team = standings[place]!; // rank === place + 1
      seeds.push({ seed: seedNum, teamId: team.teamId, teamName: team.teamName, group: team.group });
      seedNum++;
    }
  }

  return seeds;
}
