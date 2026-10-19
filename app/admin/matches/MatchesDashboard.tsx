"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Match, MatchStage, MatchStatus } from "@/types/domain";
import { STATUS_BADGE_CLASSES, STATUS_LABELS } from "@/lib/matches/statusLabels";
import { divisionWait } from "@/lib/matches/divisionOrder";

const STATUS_OPTIONS: MatchStatus[] = [
  "pending",
  "awaiting_confirmation",
  "confirmed",
  "disputed",
];

const STAGE_LABELS: Record<MatchStage, string> = {
  group: "조별리그",
  knockout: "토너먼트",
};

interface MatchOrder {
  seq: Map<string, number>; // 조(토너먼트는 부문) 안에서 몇 번째 경기인지 (1-based)
  nextIds: Set<string>; // 조마다 다음 차례 경기
}

/**
 * 참가자 화면의 "조 전체 경기 순서"와 같은 규칙: 조별리그는 (부문, 조), 토너먼트는
 * 부문 단위로 라운드 → 경기 순서대로 번호를 매긴다. 먼저 끝나야 하는 다른 부문
 * 경기가 남아 있으면 그 부문에는 다음 차례를 표시하지 않는다.
 */
function computeMatchOrder(matches: Match[]): MatchOrder {
  const buckets = new Map<string, Match[]>();
  for (const m of matches) {
    if (m.isBye) continue;
    const key = `${m.division}|${m.stage}|${m.stage === "group" ? (m.group ?? "") : ""}`;
    const list = buckets.get(key) ?? [];
    list.push(m);
    buckets.set(key, list);
  }

  const seq = new Map<string, number>();
  const nextIds = new Set<string>();
  for (const list of buckets.values()) {
    list.sort((a, b) => (a.roundIndex ?? 0) - (b.roundIndex ?? 0) || (a.order ?? 0) - (b.order ?? 0));
    list.forEach((m, i) => seq.set(m.id, i + 1));
    if (divisionWait(list[0]!.division, matches)) continue;
    const next = list.find((m) => m.status !== "confirmed" && m.teamAId && m.teamBId);
    if (next) nextIds.add(next.id);
  }
  return { seq, nextIds };
}

export default function MatchesDashboard({ matches }: { matches: Match[] }) {
  const [division, setDivision] = useState("all");
  const [stage, setStage] = useState<"all" | MatchStage>("all");
  const [group, setGroup] = useState("all");
  const [round, setRound] = useState("all");
  const [status, setStatus] = useState<"all" | MatchStatus>("all");

  const divisions = useMemo(
    () => Array.from(new Set(matches.map((m) => m.division))).sort(),
    [matches]
  );
  const groups = useMemo(
    () =>
      Array.from(
        new Set(
          matches
            .filter((m) => division === "all" || m.division === division)
            .map((m) => m.group)
            .filter((g): g is string => g !== null)
        )
      ).sort(),
    [matches, division]
  );
  const order = useMemo(() => computeMatchOrder(matches), [matches]);
  const rounds = useMemo(
    () => Array.from(new Set(matches.map((m) => m.round))).sort(),
    [matches]
  );

  const filtered = matches.filter((m) => {
    if (division !== "all" && m.division !== division) return false;
    if (stage !== "all" && m.stage !== stage) return false;
    if (group !== "all" && m.group !== group) return false;
    if (round !== "all" && m.round !== round) return false;
    if (status !== "all" && m.status !== status) return false;
    return true;
  });
  // 조별로 진행 순서가 이어지도록: 부문 → 조별리그/토너먼트 → 조 → 순서
  filtered.sort(
    (a, b) =>
      a.division.localeCompare(b.division) ||
      (a.stage === b.stage ? 0 : a.stage === "group" ? -1 : 1) ||
      (a.group ?? "").localeCompare(b.group ?? "") ||
      (order.seq.get(a.id) ?? 0) - (order.seq.get(b.id) ?? 0)
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3">
        <select
          value={division}
          onChange={(e) => {
            setDivision(e.target.value);
            setGroup("all");
          }}
          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
        >
          <option value="all">전체 부문</option>
          {divisions.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <select
          value={stage}
          onChange={(e) => setStage(e.target.value as "all" | MatchStage)}
          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
        >
          <option value="all">전체 단계</option>
          <option value="group">조별리그</option>
          <option value="knockout">토너먼트</option>
        </select>
        <select
          value={group}
          onChange={(e) => setGroup(e.target.value)}
          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
        >
          <option value="all">전체 조</option>
          {groups.map((g) => (
            <option key={g} value={g}>
              {g}조
            </option>
          ))}
        </select>
        <select
          value={round}
          onChange={(e) => setRound(e.target.value)}
          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
        >
          <option value="all">전체 라운드</option>
          {rounds.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as "all" | MatchStatus)}
          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
        >
          <option value="all">전체 상태</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <span className="ml-auto self-center text-sm text-neutral-500">
          {filtered.length}건
        </span>
      </div>

      <div className="overflow-auto rounded-lg border border-neutral-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-100 text-neutral-600">
            <tr>
              <th className="px-3 py-2">순서</th>
              <th className="px-3 py-2">부문</th>
              <th className="px-3 py-2">단계</th>
              <th className="px-3 py-2">조</th>
              <th className="px-3 py-2">라운드</th>
              <th className="px-3 py-2">팀A</th>
              <th className="px-3 py-2">팀B</th>
              <th className="px-3 py-2">점수</th>
              <th className="px-3 py-2">상태</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((m) => (
              <tr
                key={m.id}
                className={`border-t border-neutral-200 ${order.nextIds.has(m.id) ? "bg-neutral-50 font-semibold" : ""}`}
              >
                <td className="whitespace-nowrap px-3 py-2">
                  {order.seq.get(m.id) ?? "-"}
                  {order.nextIds.has(m.id) && (
                    <span className="ml-2 rounded-full bg-neutral-900 px-2 py-0.5 text-xs font-medium text-white">
                      다음 차례
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">{m.division}</td>
                <td className="px-3 py-2">{STAGE_LABELS[m.stage]}</td>
                <td className="px-3 py-2">{m.group ?? "-"}</td>
                <td className="px-3 py-2">{m.round}</td>
                <td className="px-3 py-2">{m.teamAName ?? "상대 미정"}</td>
                <td className="px-3 py-2">{m.teamBName ?? (m.isBye ? "부전승" : "상대 미정")}</td>
                <td className="px-3 py-2">
                  {m.scoreA !== null && m.scoreB !== null
                    ? `${m.scoreA} : ${m.scoreB}`
                    : "-"}
                </td>
                <td className="px-3 py-2">
                  {m.isBye ? (
                    <Link
                      href={`/admin/matches/${m.id}`}
                      className="inline-block rounded-full bg-sky-100 px-2 py-1 text-xs font-medium text-sky-700"
                    >
                      부전승
                    </Link>
                  ) : (
                    <Link
                      href={`/admin/matches/${m.id}`}
                      className={`inline-block rounded-full px-2 py-1 text-xs font-medium ${STATUS_BADGE_CLASSES[m.status]}`}
                    >
                      {STATUS_LABELS[m.status]}
                    </Link>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-neutral-400">
                  표시할 경기가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
