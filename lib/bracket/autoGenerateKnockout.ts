import { buildDivisionKnockout } from "@/lib/bracket/divisionKnockout";
import { commitKnockoutBracket } from "@/lib/bracket/commitKnockoutBracket";
import { computeGroupStandings } from "@/lib/standings/standings";
import { getTournament, listTeams, listMatches } from "@/lib/supabase/repo";

const ADVANCE_COUNT = 2; // 고정: 조 1·2위 진출

export interface AutoGenerateKnockoutResult {
  generated: boolean;
  matchCount?: number;
}

/**
 * generateKnockoutBracket(관리자 수동, 상세 에러 반환)과 로직은 거의 같지만,
 * 조별리그 마지막 경기가 확정되는 순간 자동으로 호출되므로 에러를 절대
 * 사용자에게 노출하지 않고 항상 조용히 실패한다. 관리자 수동 버튼과는
 * 의도적으로 분리되어 있으며 공유 리팩터링하지 않는다.
 */
export async function autoGenerateKnockoutBracket(
  tournamentId: string,
  division: string
): Promise<AutoGenerateKnockoutResult> {
  try {
    const tournament = await getTournament(tournamentId);
    if (tournament?.leagueDivisions?.includes(division)) return { generated: false }; // 리그전 부문은 토너먼트 없음

    const divisionMatches = await listMatches(tournamentId, { divisions: [division] });

    if (divisionMatches.some((m) => m.stage === "knockout")) return { generated: false }; // 이미 생성됨 (멱등성)

    const groupMatches = divisionMatches.filter((m) => m.stage === "group");
    if (groupMatches.length === 0) return { generated: false };
    if (groupMatches.some((m) => m.status !== "confirmed")) return { generated: false }; // 아직 다 안 끝남

    const teams = await listTeams(tournamentId, { division });
    if (teams.length === 0) return { generated: false };

    const standingsByGroup = computeGroupStandings(teams, groupMatches);
    const bracketResult = buildDivisionKnockout(standingsByGroup, ADVANCE_COUNT);
    if ("error" in bracketResult) return { generated: false }; // 예: 한 조에 팀이 2개 미만

    const { matchCount } = await commitKnockoutBracket(tournamentId, division, bracketResult, Date.now());
    return { generated: true, matchCount };
  } catch {
    return { generated: false }; // 관계없는 경기를 확정한 팀에게 에러를 노출하지 않음
  }
}
