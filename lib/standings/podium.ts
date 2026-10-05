import { determineWinner } from "@/lib/matches/advancement";
import type { TeamStanding } from "./standings";
import type { Match } from "@/types/domain";

export interface PodiumEntry {
  label: string; // "우승" | "준우승" | "3위" | "4위"
  teamId: string;
  teamName: string;
}

/**
 * 부문 최종 결과. 리그전은 조별리그가 모두 확정되면 1위가 우승, 그 외에는
 * 결승·3·4위전이 확정되는 대로 해당 순위를 채운다. 아직 정해진 게 없으면 빈 배열.
 */
export function computePodium(
  divisionMatches: Match[],
  standingsByGroup: Map<string, TeamStanding[]>,
  isLeague: boolean
): PodiumEntry[] {
  if (isLeague) {
    const groupMatches = divisionMatches.filter((m) => m.stage === "group");
    const done = groupMatches.length > 0 && groupMatches.every((m) => m.status === "confirmed");
    if (!done || standingsByGroup.size !== 1) return [];
    const [standings] = standingsByGroup.values();
    const top = standings![0];
    return top ? [{ label: "우승", teamId: top.teamId, teamName: top.teamName }] : [];
  }

  const podium: PodiumEntry[] = [];
  const add = (round: string, winnerLabel: string, loserLabel: string) => {
    const m = divisionMatches.find((x) => x.stage === "knockout" && x.round === round);
    const winner = m ? determineWinner(m) : null;
    if (!m || !winner || m.isBye) return;
    const loserIsA = winner.teamId !== m.teamAId;
    podium.push({ label: winnerLabel, ...winner });
    podium.push({
      label: loserLabel,
      teamId: (loserIsA ? m.teamAId : m.teamBId)!,
      teamName: (loserIsA ? m.teamAName : m.teamBName)!,
    });
  };
  add("결승", "우승", "준우승");
  add("3·4위전", "3위", "4위");
  return podium;
}
