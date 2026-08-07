"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Match, MatchSide } from "@/types/domain";
import { STATUS_BADGE_CLASSES, STATUS_LABELS } from "@/lib/matches/statusLabels";
import { submitMatchScore, confirmMatchScore } from "@/app/actions/participant";

function toOwnPerspective(side: MatchSide, a: number, b: number) {
  return side === "teamA" ? { own: a, opponent: b } : { own: b, opponent: a };
}

export default function MatchDetail({
  match,
  side,
  ownTeamName,
  opponentTeamName,
}: {
  match: Match;
  side: MatchSide;
  ownTeamName: string;
  opponentTeamName: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [ownScore, setOwnScore] = useState("");
  const [opponentScore, setOpponentScore] = useState("");

  function runSubmit() {
    const own = Number(ownScore);
    const opponent = Number(opponentScore);
    setError(null);
    startTransition(async () => {
      const res = await submitMatchScore(match.id, own, opponent);
      if (res.error) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  function runConfirm(own: number, opponent: number) {
    setError(null);
    startTransition(async () => {
      const res = await confirmMatchScore(match.id, own, opponent);
      if (res.error) {
        setError(res.error);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  const header = (
    <div className="mb-6 flex items-center justify-between">
      <div>
        <p className="text-xs text-neutral-500">{match.round}</p>
        <h1 className="text-xl font-bold text-neutral-900">
          {ownTeamName} <span className="text-neutral-400">vs</span> {opponentTeamName}
        </h1>
      </div>
      <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_BADGE_CLASSES[match.status]}`}>
        {STATUS_LABELS[match.status]}
      </span>
    </div>
  );

  // 1. Nobody has submitted yet — show entry form.
  if (match.status === "pending") {
    return (
      <div>
        {header}
        <ScoreEntryForm
          ownLabel={`${ownTeamName} 점수`}
          opponentLabel={`${opponentTeamName} 점수`}
          ownScore={ownScore}
          opponentScore={opponentScore}
          setOwnScore={setOwnScore}
          setOpponentScore={setOpponentScore}
          onSubmit={runSubmit}
          submitLabel="점수 제출"
          pending={pending}
          error={error}
        />
      </div>
    );
  }

  // 2. Awaiting confirmation.
  if (match.status === "awaiting_confirmation") {
    const submittedA = match.submittedScoreA ?? 0;
    const submittedB = match.submittedScoreB ?? 0;
    const { own, opponent } = toOwnPerspective(side, submittedA, submittedB);

    if (match.submittedBy === side) {
      return (
        <div>
          {header}
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-center">
            <p className="text-lg font-semibold text-neutral-900">
              {own} : {opponent}
            </p>
            <p className="mt-2 text-sm text-amber-700">
              상대팀의 확인을 기다리는 중입니다.
            </p>
          </div>
        </div>
      );
    }

    if (editing) {
      return (
        <div>
          {header}
          <p className="mb-4 text-sm text-neutral-600">
            상대팀이 입력한 점수와 다르면 직접 입력해주세요. 확정 전까지는 관리자가
            최종 확인합니다.
          </p>
          <ScoreEntryForm
            ownLabel={`${ownTeamName} 점수`}
            opponentLabel={`${opponentTeamName} 점수`}
            ownScore={ownScore}
            opponentScore={opponentScore}
            setOwnScore={setOwnScore}
            setOpponentScore={setOpponentScore}
            onSubmit={() => runConfirm(Number(ownScore), Number(opponentScore))}
            submitLabel="다른 점수로 제출"
            pending={pending}
            error={error}
          />
          <button
            onClick={() => setEditing(false)}
            className="mt-3 w-full text-sm text-neutral-400 underline"
          >
            취소
          </button>
        </div>
      );
    }

    return (
      <div>
        {header}
        <div className="rounded-xl border border-neutral-200 p-5 text-center">
          <p className="text-sm text-neutral-500">상대팀이 입력한 점수</p>
          <p className="mt-1 text-2xl font-bold text-neutral-900">
            {own} : {opponent}
          </p>
          <p className="mt-1 text-xs text-neutral-400">
            ({ownTeamName} : {opponentTeamName})
          </p>
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-4 flex gap-3">
          <button
            onClick={() => runConfirm(own, opponent)}
            disabled={pending}
            className="flex-1 rounded-lg bg-neutral-900 px-4 py-3 text-white disabled:opacity-50"
          >
            {pending ? "처리 중..." : "확인 (동일함)"}
          </button>
          <button
            onClick={() => {
              setOwnScore(String(own));
              setOpponentScore(String(opponent));
              setEditing(true);
            }}
            className="flex-1 rounded-lg border border-neutral-300 px-4 py-3"
          >
            다르게 입력
          </button>
        </div>
      </div>
    );
  }

  // 3. Confirmed — final score.
  if (match.status === "confirmed") {
    const { own, opponent } = toOwnPerspective(side, match.scoreA ?? 0, match.scoreB ?? 0);
    return (
      <div>
        {header}
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-center">
          <p className="text-3xl font-bold text-neutral-900">
            {own} : {opponent}
          </p>
          <p className="mt-2 text-sm text-emerald-700">
            {match.resolvedBy === "admin" ? "관리자가 확정한 점수입니다." : "확정된 점수입니다."}
          </p>
        </div>
      </div>
    );
  }

  // 4. Disputed — read-only, waiting on admin.
  const submitted = toOwnPerspective(side, match.submittedScoreA ?? 0, match.submittedScoreB ?? 0);
  const opponentClaim = toOwnPerspective(side, match.opponentScoreA ?? 0, match.opponentScoreB ?? 0);
  return (
    <div>
      {header}
      <div className="rounded-xl border border-red-200 bg-red-50 p-5">
        <p className="text-sm font-medium text-red-700">
          두 팀이 입력한 점수가 달라 관리자 확인이 필요합니다.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 text-center">
          <div>
            <p className="text-xs text-neutral-500">처음 제출된 점수</p>
            <p className="text-lg font-semibold text-neutral-900">
              {submitted.own} : {submitted.opponent}
            </p>
          </div>
          <div>
            <p className="text-xs text-neutral-500">상대팀이 다르게 입력한 점수</p>
            <p className="text-lg font-semibold text-neutral-900">
              {opponentClaim.own} : {opponentClaim.opponent}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ScoreEntryForm({
  ownLabel,
  opponentLabel,
  ownScore,
  opponentScore,
  setOwnScore,
  setOpponentScore,
  onSubmit,
  submitLabel,
  pending,
  error,
}: {
  ownLabel: string;
  opponentLabel: string;
  ownScore: string;
  opponentScore: string;
  setOwnScore: (v: string) => void;
  setOpponentScore: (v: string) => void;
  onSubmit: () => void;
  submitLabel: string;
  pending: boolean;
  error: string | null;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="flex flex-col gap-4"
    >
      <div className="flex gap-3">
        <div className="flex flex-1 flex-col gap-2">
          <label className="text-sm font-medium text-neutral-700">{ownLabel}</label>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            required
            value={ownScore}
            onChange={(e) => setOwnScore(e.target.value)}
            className="rounded-lg border border-neutral-300 px-4 py-3 text-center text-xl focus:border-neutral-900 focus:outline-none"
          />
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <label className="text-sm font-medium text-neutral-700">{opponentLabel}</label>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            required
            value={opponentScore}
            onChange={(e) => setOpponentScore(e.target.value)}
            className="rounded-lg border border-neutral-300 px-4 py-3 text-center text-xl focus:border-neutral-900 focus:outline-none"
          />
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-neutral-900 px-4 py-3 text-white disabled:opacity-50"
      >
        {pending ? "처리 중..." : submitLabel}
      </button>
    </form>
  );
}
