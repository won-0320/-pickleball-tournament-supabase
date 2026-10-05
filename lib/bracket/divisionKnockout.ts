import type { TeamStanding } from "@/lib/standings/standings";
import { buildSeedList } from "./seeding";
import { buildKnockoutBracket, type KnockoutBracketDraft, type KnockoutMatchDraft } from "./knockoutBracket";

/**
 * 조별리그 결과로 본선 대진을 만든다. 2개 조에서 1·2위가 진출하면
 * 준결승 없이 "각 조 1위끼리 결승, 각 조 2위끼리 3·4위전"으로 바로 붙이고,
 * 그 외에는 기존 시드 기반 토너먼트를 만든다.
 */
export function buildDivisionKnockout(
  standingsByGroup: Map<string, TeamStanding[]>,
  advanceCount: number
): KnockoutBracketDraft | { error: string } {
  if (standingsByGroup.size === 2 && advanceCount === 2) {
    return buildPlacementMatches(standingsByGroup);
  }

  const seedsResult = buildSeedList(standingsByGroup, advanceCount);
  if ("error" in seedsResult) return seedsResult;
  return buildKnockoutBracket(seedsResult);
}

function buildPlacementMatches(
  standingsByGroup: Map<string, TeamStanding[]>
): KnockoutBracketDraft | { error: string } {
  const groups = Array.from(standingsByGroup.keys()).sort((a, b) => a.localeCompare(b));
  const [g1, g2] = groups.map((g) => standingsByGroup.get(g)!);
  for (const [i, standings] of [g1!, g2!].entries()) {
    if (standings.length < 2) {
      return { error: `"${groups[i]}" 조는 팀이 2개 미만이라 결승·3·4위전을 만들 수 없습니다.` };
    }
  }

  // 둘 다 roundIndex 0 + roundCount 1 → 서로 연결(nextMatchId)되지 않는 독립 경기.
  const match = (slotIndex: number, roundName: string, place: number): KnockoutMatchDraft => {
    const a = g1![place]!;
    const b = g2![place]!;
    return {
      roundIndex: 0,
      slotIndex,
      roundName,
      teamAId: a.teamId,
      teamAName: a.teamName,
      teamASeed: null,
      teamBId: b.teamId,
      teamBName: b.teamName,
      teamBSeed: null,
      isBye: false,
    };
  };

  return {
    roundCount: 1,
    matches: [match(0, "3·4위전", 1), match(1, "결승", 0)],
    warnings: [],
  };
}
