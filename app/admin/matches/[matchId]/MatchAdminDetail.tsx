"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Match, Team } from "@/types/domain";
import { STATUS_BADGE_CLASSES, STATUS_LABELS } from "@/lib/matches/statusLabels";
import { resolveMatchDispute } from "@/app/actions/admin";

export default function MatchAdminDetail({
  match,
  teamA,
  teamB,
}: {
  match: Match;
  teamA: Team;
  teamB: Team;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [scoreA, setScoreA] = useState(String(match.opponentScoreA ?? match.submittedScoreA ?? ""));
  const [scoreB, setScoreB] = useState(String(match.opponentScoreB ?? match.submittedScoreB ?? ""));

  function handleResolve() {
    setError(null);
    startTransition(async () => {
      const res = await resolveMatchDispute(match.id, Number(scoreA), Number(scoreB));
      if (res.error) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-neutral-500">
            {match.division} · {match.round} {match.court ? `· ${match.court}` : ""}
          </p>
          <h1 className="text-xl font-bold text-neutral-900">
            {match.teamAName} <span className="text-neutral-400">vs</span> {match.teamBName}
          </h1>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_BADGE_CLASSES[match.status]}`}>
          {STATUS_LABELS[match.status]}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div className="rounded-lg border border-neutral-200 p-3">
          <p className="font-medium text-neutral-900">{teamA.teamName} (팀A)</p>
          <p className="text-neutral-500">{teamA.player1} / {teamA.player2}</p>
          <p className="mt-1 font-mono text-neutral-400">코드 {teamA.code}</p>
        </div>
        <div className="rounded-lg border border-neutral-200 p-3">
          <p className="font-medium text-neutral-900">{teamB.teamName} (팀B)</p>
          <p className="text-neutral-500">{teamB.player1} / {teamB.player2}</p>
          <p className="mt-1 font-mono text-neutral-400">코드 {teamB.code}</p>
        </div>
      </div>

      {match.status === "confirmed" && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-center">
          <p className="text-2xl font-bold text-neutral-900">
            {match.scoreA} : {match.scoreB}
          </p>
          <p className="mt-1 text-sm text-emerald-700">
            {match.resolvedBy === "admin" ? "관리자가 확정" : "양팀 확인으로 확정"}
          </p>
        </div>
      )}

      {match.status === "pending" && (
        <p className="rounded-lg border border-dashed border-neutral-300 p-4 text-center text-sm text-neutral-400">
          아직 점수가 제출되지 않았습니다.
        </p>
      )}

      {match.status === "awaiting_confirmation" && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
          <p>
            {(match.submittedBy === "teamA" ? teamA.teamName : teamB.teamName)}팀이 점수를
            제출했습니다: {match.submittedScoreA} : {match.submittedScoreB} (팀A : 팀B).
            상대팀 확인 대기 중입니다.
          </p>
        </div>
      )}

      {match.status === "disputed" && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-center text-sm">
            <div>
              <p className="text-neutral-500">처음 제출된 점수 (팀A : 팀B)</p>
              <p className="text-lg font-semibold text-neutral-900">
                {match.submittedScoreA} : {match.submittedScoreB}
              </p>
            </div>
            <div>
              <p className="text-neutral-500">상대팀이 입력한 점수 (팀A : 팀B)</p>
              <p className="text-lg font-semibold text-neutral-900">
                {match.opponentScoreA} : {match.opponentScoreB}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-neutral-700">최종 점수 확정 (팀A : 팀B)</p>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={0}
                inputMode="numeric"
                value={scoreA}
                onChange={(e) => setScoreA(e.target.value)}
                className="w-24 rounded-lg border border-neutral-300 px-3 py-2 text-center text-lg"
              />
              <span className="text-neutral-400">:</span>
              <input
                type="number"
                min={0}
                inputMode="numeric"
                value={scoreB}
                onChange={(e) => setScoreB(e.target.value)}
                className="w-24 rounded-lg border border-neutral-300 px-3 py-2 text-center text-lg"
              />
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            onClick={handleResolve}
            disabled={pending}
            className="rounded-lg bg-neutral-900 px-4 py-3 text-white disabled:opacity-50"
          >
            {pending ? "처리 중..." : "최종 점수 확정"}
          </button>
        </div>
      )}
    </div>
  );
}
