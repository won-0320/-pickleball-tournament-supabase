"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Match, Team } from "@/types/domain";
import { STATUS_BADGE_CLASSES, STATUS_LABELS } from "@/lib/matches/statusLabels";
import { resolveMatchDispute, overrideMatchScore, resetMatch } from "@/app/actions/admin";

export default function MatchAdminDetail({
  match,
  teamA,
  teamB,
  seq,
}: {
  match: Match;
  teamA?: Team;
  teamB?: Team;
  seq?: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [scoreA, setScoreA] = useState(String(match.opponentScoreA ?? match.submittedScoreA ?? ""));
  const [scoreB, setScoreB] = useState(String(match.opponentScoreB ?? match.submittedScoreB ?? ""));

  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideError, setOverrideError] = useState<string | null>(null);
  const [overrideA, setOverrideA] = useState(String(match.scoreA ?? ""));
  const [overrideB, setOverrideB] = useState(String(match.scoreB ?? ""));

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

  function handleOverride() {
    setOverrideError(null);
    startTransition(async () => {
      const res = await overrideMatchScore(match.id, Number(overrideA), Number(overrideB));
      if (res.error) {
        setOverrideError(res.error);
        return;
      }
      setOverrideOpen(false);
      router.refresh();
    });
  }

  const [resetError, setResetError] = useState<string | null>(null);

  function handleReset() {
    if (!window.confirm("이 경기의 점수를 모두 지우고 '점수 미입력' 상태로 되돌립니다. 두 팀이 처음부터 다시 입력해야 합니다. 계속할까요?")) {
      return;
    }
    setResetError(null);
    startTransition(async () => {
      const res = await resetMatch(match.id);
      if (res.error) {
        setResetError(res.error);
        return;
      }
      setOverrideA("");
      setOverrideB("");
      router.refresh();
    });
  }

  const header = (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-xs text-neutral-500">
          {match.division} · {match.stage === "group" ? `조별리그 · ${match.group}조` : "토너먼트"} ·{" "}
          {seq && <span className="font-semibold text-neutral-700">{seq}번째 경기 · </span>}
          {match.round}
        </p>
        <h1 className="text-xl font-bold text-neutral-900">
          {match.teamAName ?? "상대 미정"} <span className="text-neutral-400">vs</span>{" "}
          {match.teamBName ?? (match.isBye ? "부전승" : "상대 미정")}
        </h1>
      </div>
      {match.isBye ? (
        <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-medium text-sky-700">부전승</span>
      ) : (
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_BADGE_CLASSES[match.status]}`}>
          {STATUS_LABELS[match.status]}
        </span>
      )}
    </div>
  );

  if (match.isBye) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-5 text-center">
          <p className="text-lg font-semibold text-neutral-900">
            {match.teamAName ?? match.teamBName}
          </p>
          <p className="mt-2 text-sm text-sky-700">부전승으로 다음 라운드에 자동 진출했습니다.</p>
        </div>
      </div>
    );
  }

  if (!match.teamAId || !match.teamBId) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <p className="rounded-lg border border-dashed border-neutral-300 p-4 text-center text-sm text-neutral-400">
          이전 라운드 경기 결과를 기다리는 중입니다. 상대팀이 아직 결정되지 않았습니다.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {header}

      <div className="grid grid-cols-2 gap-4 text-sm">
        {teamA && (
          <div className="rounded-lg border border-neutral-200 p-3">
            <p className="font-medium text-neutral-900">{teamA.teamName} (팀A)</p>
            <p className="text-neutral-500">{teamA.player1} / {teamA.player2}</p>
            <p className="mt-1 font-mono text-neutral-400">코드 {teamA.code}</p>
          </div>
        )}
        {teamB && (
          <div className="rounded-lg border border-neutral-200 p-3">
            <p className="font-medium text-neutral-900">{teamB.teamName} (팀B)</p>
            <p className="text-neutral-500">{teamB.player1} / {teamB.player2}</p>
            <p className="mt-1 font-mono text-neutral-400">코드 {teamB.code}</p>
          </div>
        )}
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
            {(match.submittedBy === "teamA" ? match.teamAName : match.teamBName)}팀이 점수를
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

      <div className="rounded-lg border border-neutral-200 p-4">
        <button
          onClick={() => setOverrideOpen((v) => !v)}
          className="text-sm font-medium text-neutral-500 underline"
        >
          {overrideOpen ? "관리자 강제 확정 닫기" : "관리자 강제 확정 (분쟁이 아닌 경우 — 예: 무단결장)"}
        </button>
        {overrideOpen && (
          <div className="mt-3 flex flex-col gap-3">
            <p className="text-xs text-neutral-500">
              현재 상태와 무관하게 점수를 강제로 확정합니다. 팀이 경기에 나오지 않는 등 정상적인
              제출/확인 절차를 진행할 수 없을 때 사용하세요.
            </p>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={0}
                inputMode="numeric"
                value={overrideA}
                onChange={(e) => setOverrideA(e.target.value)}
                className="w-24 rounded-lg border border-neutral-300 px-3 py-2 text-center text-lg"
              />
              <span className="text-neutral-400">:</span>
              <input
                type="number"
                min={0}
                inputMode="numeric"
                value={overrideB}
                onChange={(e) => setOverrideB(e.target.value)}
                className="w-24 rounded-lg border border-neutral-300 px-3 py-2 text-center text-lg"
              />
            </div>
            {overrideError && <p className="text-sm text-red-600">{overrideError}</p>}
            <button
              onClick={handleOverride}
              disabled={pending}
              className="w-fit rounded-lg border border-neutral-900 px-4 py-3 text-sm font-medium text-neutral-900 disabled:opacity-50"
            >
              {pending ? "처리 중..." : "강제 확정"}
            </button>
          </div>
        )}
      </div>

      {match.status !== "pending" && !match.isBye && (
        <div className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-4">
          <p className="text-xs text-neutral-500">
            점수를 지우고 처음 상태로 되돌립니다. 두 팀이 점수를 다시 입력·확인해야 합니다.
          </p>
          {resetError && <p className="text-sm text-red-600">{resetError}</p>}
          <button
            onClick={handleReset}
            disabled={pending}
            className="w-fit rounded-lg border border-red-300 px-4 py-3 text-sm font-medium text-red-600 disabled:opacity-50"
          >
            {pending ? "처리 중..." : "점수 초기화"}
          </button>
        </div>
      )}
    </div>
  );
}
