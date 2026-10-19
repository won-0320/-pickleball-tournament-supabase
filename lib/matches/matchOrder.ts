import type { Match, MatchStage } from "@/types/domain";
import { divisionWait } from "./divisionOrder";

type Orderable = {
  division: string;
  stage?: MatchStage; // 업로드 미리보기의 조별리그 초안에는 없음
  group: string | null;
  roundIndex: number | null;
  order: number | null;
};

/**
 * 진행 순서 번호. 참가자 화면의 "조 전체 경기 순서"와 같은 규칙으로, 조별리그는
 * (부문, 조), 토너먼트는 부문 단위로 라운드 → 경기 순서대로 1부터 매긴다.
 */
export function sequenceNumbers<T extends Orderable>(items: T[]): Map<T, number> {
  const buckets = new Map<string, T[]>();
  for (const m of items) {
    const stage = m.stage ?? "group";
    const key = `${m.division}|${stage}|${stage === "group" ? (m.group ?? "") : ""}`;
    const list = buckets.get(key) ?? [];
    list.push(m);
    buckets.set(key, list);
  }

  const seq = new Map<T, number>();
  for (const list of buckets.values()) {
    list
      .sort((a, b) => (a.roundIndex ?? 0) - (b.roundIndex ?? 0) || (a.order ?? 0) - (b.order ?? 0))
      .forEach((m, i) => seq.set(m, i + 1));
  }
  return seq;
}

export interface MatchOrder {
  seq: Map<string, number>; // match id → 몇 번째 경기 (부전승 제외)
  nextIds: Set<string>; // 조(토너먼트는 부문)마다 다음 차례 경기
}

/**
 * 경기별 순서 번호와 다음 차례 경기. 먼저 끝나야 하는 다른 부문 경기가 남아
 * 있으면 그 부문에는 다음 차례를 표시하지 않는다 (참가자 화면과 동일).
 */
export function computeMatchOrder(matches: Match[]): MatchOrder {
  const playable = matches.filter((m) => !m.isBye);
  const seqByMatch = sequenceNumbers(playable);

  const seq = new Map<string, number>();
  for (const [m, n] of seqByMatch) seq.set(m.id, n);

  const nextIds = new Set<string>();
  const firstUnplayed = new Map<string, Match>();
  for (const m of [...playable].sort((a, b) => seqByMatch.get(a)! - seqByMatch.get(b)!)) {
    if (m.status === "confirmed" || !m.teamAId || !m.teamBId) continue;
    const key = `${m.division}|${m.stage}|${m.stage === "group" ? (m.group ?? "") : ""}`;
    if (!firstUnplayed.has(key)) firstUnplayed.set(key, m);
  }
  for (const m of firstUnplayed.values()) {
    if (!divisionWait(m.division, matches)) nextIds.add(m.id);
  }
  return { seq, nextIds };
}
