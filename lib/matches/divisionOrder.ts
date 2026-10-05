import type { Match, MatchStage } from "@/types/domain";

interface Prerequisite {
  division: string;
  stage?: MatchStage; // 없으면 그 부문의 모든 경기
}

/**
 * 부문 진행 순서. 혼복은 남복·여복 선수가 겹치므로 남복 조별리그와 여복이
 * 모두 끝난 뒤 시작한다. 부문 이름은 업로드한 엑셀의 "부문" 값과 같아야 한다.
 * 안내 표시용일 뿐, 점수 입력을 막지는 않는다.
 */
const DIVISION_PREREQUISITES: Record<string, { label: string; requires: Prerequisite[] }> = {
  혼복: {
    label: "남복 조별리그와 여복 경기가 모두 끝난 뒤 시작합니다.",
    requires: [{ division: "남복", stage: "group" }, { division: "여복" }],
  },
};

export interface DivisionWait {
  label: string;
  remaining: number; // 먼저 끝나야 하는 경기 중 아직 확정되지 않은 수
}

export function divisionWait(division: string, allMatches: Match[]): DivisionWait | null {
  const rule = DIVISION_PREREQUISITES[division];
  if (!rule) return null;

  const remaining = allMatches.filter(
    (m) =>
      !m.isBye &&
      m.status !== "confirmed" &&
      rule.requires.some((r) => r.division === m.division && (!r.stage || r.stage === m.stage))
  ).length;

  return remaining > 0 ? { label: rule.label, remaining } : null;
}
