"use client";

import { useMemo, useState } from "react";
import type { Team } from "@/types/domain";

export default function TeamCodeTable({ teams }: { teams: Team[] }) {
  const [query, setQuery] = useState("");
  const [division, setDivision] = useState("all");

  const divisions = useMemo(
    () => Array.from(new Set(teams.map((t) => t.division))).sort(),
    [teams]
  );

  const filtered = useMemo(() => {
    return teams.filter((t) => {
      if (division !== "all" && t.division !== division) return false;
      if (!query) return true;
      const q = query.trim();
      return (
        t.teamName.includes(q) ||
        t.player1.includes(q) ||
        t.player2.includes(q) ||
        t.code.includes(q)
      );
    });
  }, [teams, query, division]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="팀명/선수명/코드 검색"
          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
        />
        <select
          value={division}
          onChange={(e) => setDivision(e.target.value)}
          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
        >
          <option value="all">전체 수준</option>
          {divisions.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <button
          onClick={() => window.print()}
          className="ml-auto rounded-lg border border-neutral-300 px-3 py-2 text-sm"
        >
          인쇄
        </button>
      </div>

      <div className="overflow-auto rounded-lg border border-neutral-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-100 text-neutral-600">
            <tr>
              <th className="px-3 py-2">수준</th>
              <th className="px-3 py-2">팀명</th>
              <th className="px-3 py-2">선수1</th>
              <th className="px-3 py-2">선수2</th>
              <th className="px-3 py-2">코드</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((t) => (
              <tr key={t.id} className="border-t border-neutral-200">
                <td className="px-3 py-2">{t.division}</td>
                <td className="px-3 py-2">{t.teamName}</td>
                <td className="px-3 py-2">{t.player1}</td>
                <td className="px-3 py-2">{t.player2}</td>
                <td className="px-3 py-2 font-mono text-base font-semibold tracking-wider">
                  {t.code}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-neutral-400">
                  표시할 팀이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
