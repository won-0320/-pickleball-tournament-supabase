"use client";

import { useMemo, useState } from "react";
import type { Team } from "@/types/domain";

export default function TeamCodeTable({ teams }: { teams: Team[] }) {
  const [query, setQuery] = useState("");
  const [division, setDivision] = useState("all");
  const [group, setGroup] = useState("all"); // 부문을 고른 뒤에만 의미 있음

  const divisions = useMemo(
    () => Array.from(new Set(teams.map((t) => t.division))).sort(),
    [teams]
  );

  const groups = useMemo(() => {
    if (division === "all") return [];
    return Array.from(
      new Set(
        teams
          .filter((t) => t.division === division)
          .map((t) => t.group)
          .filter((g): g is string => !!g)
      )
    ).sort((a, b) => a.localeCompare(b));
  }, [teams, division]);

  const selectDivision = (d: string) => {
    setDivision(d);
    setGroup("all");
  };

  const filtered = useMemo(() => {
    return teams.filter((t) => {
      if (division !== "all" && t.division !== division) return false;
      if (division !== "all" && group !== "all" && t.group !== group) return false;
      if (!query) return true;
      const q = query.trim();
      return (
        t.teamName.includes(q) ||
        t.player1.includes(q) ||
        t.player2.includes(q) ||
        t.code.includes(q)
      );
    });
  }, [teams, query, division, group]);

  // 부문 → 조 순서로 묶는다. 조가 없는 팀은 그 부문의 맨 뒤.
  const sections = useMemo(() => {
    const map = new Map<string, { key: string; division: string; group: string | null; teams: Team[] }>();
    for (const t of filtered) {
      const key = `${t.division}/${t.group ?? ""}`;
      let s = map.get(key);
      if (!s) {
        s = { key, division: t.division, group: t.group, teams: [] };
        map.set(key, s);
      }
      s.teams.push(t);
    }
    return Array.from(map.values()).sort(
      (a, b) =>
        a.division.localeCompare(b.division) ||
        (a.group === null ? 1 : 0) - (b.group === null ? 1 : 0) ||
        (a.group ?? "").localeCompare(b.group ?? "")
    );
  }, [filtered]);

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
        <button
          onClick={() => window.print()}
          className="ml-auto rounded-lg border border-neutral-300 px-3 py-2 text-sm"
        >
          인쇄
        </button>
      </div>

      <div className="flex flex-col gap-2 print:hidden">
        <div className="flex flex-wrap gap-2">
          <TabButton active={division === "all"} onClick={() => selectDivision("all")}>
            전체 부문
          </TabButton>
          {divisions.map((d) => (
            <TabButton key={d} active={division === d} onClick={() => selectDivision(d)}>
              {d}
            </TabButton>
          ))}
        </div>
        {groups.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <TabButton small active={group === "all"} onClick={() => setGroup("all")}>
              전체 조
            </TabButton>
            {groups.map((g) => (
              <TabButton small key={g} active={group === g} onClick={() => setGroup(g)}>
                {g}조
              </TabButton>
            ))}
          </div>
        )}
      </div>

      {sections.length === 0 && (
        <p className="rounded-lg border border-neutral-200 px-3 py-6 text-center text-sm text-neutral-400">
          표시할 팀이 없습니다.
        </p>
      )}

      {sections.map((s) => (
        <section key={s.key} className="break-inside-avoid">
          <h2 className="mb-2 text-sm font-semibold text-neutral-700">
            {s.division} · {s.group ? `${s.group}조` : "조 없음"}
            <span className="ml-2 font-normal text-neutral-400">{s.teams.length}팀</span>
          </h2>
          <div className="overflow-auto rounded-lg border border-neutral-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-100 text-neutral-600">
                <tr>
                  <th className="px-3 py-2">팀명</th>
                  <th className="px-3 py-2">선수1</th>
                  <th className="px-3 py-2">선수2</th>
                  <th className="px-3 py-2">코드</th>
                </tr>
              </thead>
              <tbody>
                {s.teams.map((t) => (
                  <tr key={t.id} className="border-t border-neutral-200">
                    <td className="px-3 py-2">{t.teamName}</td>
                    <td className="px-3 py-2">{t.player1}</td>
                    <td className="px-3 py-2">{t.player2}</td>
                    <td className="px-3 py-2 font-mono text-base font-semibold tracking-wider">
                      {t.code}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}

function TabButton({
  active,
  small,
  onClick,
  children,
}: {
  active: boolean;
  small?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border ${small ? "px-3 py-1 text-xs" : "px-4 py-1.5 text-sm"} ${
        active
          ? "border-neutral-900 bg-neutral-900 text-white"
          : "border-neutral-300 bg-white text-neutral-700"
      }`}
    >
      {children}
    </button>
  );
}
