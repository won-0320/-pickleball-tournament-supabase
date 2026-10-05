"use client";

import { useState, useTransition } from "react";
import {
  getDivisionStandings,
  generateKnockoutBracket,
  setDivisionLeague,
  type DivisionStandingsResult,
  type GenerateBracketResult,
} from "@/app/actions/admin";

export default function StandingsBoard({
  divisions,
  initialDivision,
  initialData,
}: {
  divisions: string[];
  initialDivision: string;
  initialData: DivisionStandingsResult;
}) {
  const [division, setDivision] = useState(initialDivision);
  const [data, setData] = useState(initialData);
  const [advanceCount, setAdvanceCount] = useState("2");
  const [generateResult, setGenerateResult] = useState<GenerateBracketResult | null>(null);
  const [leagueError, setLeagueError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function switchDivision(next: string) {
    setDivision(next);
    setGenerateResult(null);
    setLeagueError(null);
    startTransition(async () => {
      const res = await getDivisionStandings(next);
      setData(res);
    });
  }

  function handleGenerate() {
    setGenerateResult(null);
    startTransition(async () => {
      const res = await generateKnockoutBracket(division, Number(advanceCount));
      setGenerateResult(res);
      if (!res.error) {
        const refreshed = await getDivisionStandings(division);
        setData(refreshed);
      }
    });
  }

  function handleToggleLeague(league: boolean) {
    setLeagueError(null);
    startTransition(async () => {
      const res = await setDivisionLeague(division, league);
      if (res.error) setLeagueError(res.error);
      setData(await getDivisionStandings(division));
    });
  }

  const smallestGroupSize = data.groups.length > 0
    ? Math.min(...data.groups.map((g) => g.standings.length))
    : 0;
  const allGroupsConfirmed = data.groups.length > 0 && data.groups.every((g) => g.allConfirmed);
  const champion =
    data.isLeague && allGroupsConfirmed && data.groups.length === 1
      ? data.groups[0]!.standings[0]
      : undefined;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-2">
        {divisions.map((d) => (
          <button
            key={d}
            onClick={() => switchDivision(d)}
            className={`rounded-full px-4 py-2 text-sm font-medium ${
              d === division ? "bg-neutral-900 text-white" : "border border-neutral-300 text-neutral-600"
            }`}
          >
            부문 {d}
          </button>
        ))}
      </div>

      {data.error && <p className="text-sm text-red-600">{data.error}</p>}

      <div className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-4">
        <label className="flex items-center gap-3 text-sm font-medium text-neutral-700">
          <input
            type="checkbox"
            checked={data.isLeague}
            disabled={pending || (!data.isLeague && data.knockoutGenerated)}
            onChange={(e) => handleToggleLeague(e.target.checked)}
            className="h-4 w-4"
          />
          리그전으로 운영 (토너먼트 없음)
        </label>
        <p className="text-sm text-neutral-500">
          {data.isLeague
            ? "승점(승 3점·패 0점)이 가장 높은 팀이 우승합니다. 승점이 같으면 승자승으로 순위를 정합니다."
            : "조별리그가 끝나면 각 조 1·2위로 토너먼트 대진이 자동 생성됩니다."}
        </p>
        {leagueError && <p className="text-sm text-red-600">{leagueError}</p>}
      </div>

      {champion && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900">
          <p className="text-sm">부문 {division} 우승</p>
          <p className="text-lg font-bold">{champion.teamName}</p>
        </div>
      )}

      {data.groups.map((g) => (
        <div key={g.group} className="rounded-lg border border-neutral-200">
          <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-2">
            <p className="font-medium text-neutral-900">{g.group}조</p>
            <p className={`text-sm ${g.allConfirmed ? "text-emerald-600" : "text-amber-600"}`}>
              {g.confirmedMatches}/{g.totalMatches}경기 확정
            </p>
          </div>
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-50 text-neutral-500">
              <tr>
                <th className="px-3 py-2">순위</th>
                <th className="px-3 py-2">팀명</th>
                <th className="px-3 py-2">경기</th>
                {data.isLeague && <th className="px-3 py-2">승점</th>}
                <th className="px-3 py-2">승</th>
                <th className="px-3 py-2">패</th>
                <th className="px-3 py-2">득실차</th>
              </tr>
            </thead>
            <tbody>
              {g.standings.map((s) => (
                <tr key={s.teamId} className="border-t border-neutral-100">
                  <td className="px-3 py-2">{s.rank}</td>
                  <td className="px-3 py-2">{s.teamName}</td>
                  <td className="px-3 py-2">{s.played}</td>
                  {data.isLeague && <td className="px-3 py-2 font-medium">{s.leaguePoints}</td>}
                  <td className="px-3 py-2">{s.wins}</td>
                  <td className="px-3 py-2">{s.losses}</td>
                  <td className="px-3 py-2">{s.pointDiff > 0 ? `+${s.pointDiff}` : s.pointDiff}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {data.groups.length === 0 && !data.error && (
        <p className="text-sm text-neutral-400">이 부문에는 조가 없습니다.</p>
      )}

      {!data.isLeague && (
        <div className="rounded-lg border border-neutral-200 p-4">
          {data.knockoutGenerated ? (
            <p className="text-sm text-emerald-700">
              이미 이 부문의 토너먼트 대진이 생성되었습니다. 경기 현황에서 확인하세요.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-sm font-medium text-neutral-700">토너먼트 대진 생성</p>
              {!allGroupsConfirmed && (
                <p className="text-sm text-amber-600">
                  아직 확정되지 않은 조별리그 경기가 있습니다. 모두 확정한 뒤 생성해주세요.
                </p>
              )}
              <div className="flex items-center gap-3">
                <label htmlFor="advanceCount" className="text-sm text-neutral-600">
                  조별 진출 인원수
                </label>
                <input
                  id="advanceCount"
                  type="number"
                  min={1}
                  max={smallestGroupSize || undefined}
                  value={advanceCount}
                  onChange={(e) => setAdvanceCount(e.target.value)}
                  className="w-20 rounded-lg border border-neutral-300 px-3 py-2 text-center"
                />
              </div>
              {generateResult?.error && <p className="text-sm text-red-600">{generateResult.error}</p>}
              {generateResult?.warnings && generateResult.warnings.length > 0 && (
                <ul className="list-disc space-y-1 pl-5 text-sm text-amber-600">
                  {generateResult.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              )}
              <button
                onClick={handleGenerate}
                disabled={pending || data.groups.length === 0 || !allGroupsConfirmed}
                className="w-fit rounded-lg bg-neutral-900 px-4 py-3 text-white disabled:opacity-50"
              >
                {pending ? "처리 중..." : "토너먼트 대진 생성"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
