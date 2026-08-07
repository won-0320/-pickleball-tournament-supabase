"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  previewBracket,
  commitBracket,
  type PreviewBracketResult,
  type CommitBracketResult,
} from "@/app/actions/admin";

type Step = "form" | "preview" | "done";

export default function UploadWizard() {
  const [step, setStep] = useState<Step>("form");
  const [preview, setPreview] = useState<PreviewBracketResult | null>(null);
  const [result, setResult] = useState<CommitBracketResult | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const teamCountByDivision = useMemo(() => {
    if (!preview) return [];
    const counts = new Map<string, number>();
    for (const team of preview.teams) {
      counts.set(team.division, (counts.get(team.division) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [preview]);

  function handlePreviewSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await previewBracket(formData);
      setPreview(res);
      if (!res.authError && !res.fileError) {
        setStep("preview");
      }
    });
  }

  function handleConfirm() {
    if (!preview) return;
    startTransition(async () => {
      const res = await commitBracket({
        tournamentName: preview.tournamentName,
        teams: preview.teams,
        matches: preview.matches,
      });
      setResult(res);
      if (!res.authError) {
        setStep("done");
      }
    });
  }

  function handleReset() {
    setPreview(null);
    setResult(null);
    setStep("form");
    formRef.current?.reset();
  }

  if (step === "done" && result) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-base text-neutral-800">
          대회 &quot;{preview?.tournamentName}&quot;가 생성되었습니다. 팀{" "}
          {result.teams?.length ?? 0}개, 경기 {result.matchCount ?? 0}개가
          등록되었습니다. 이전에 활성화되어 있던 대회는 자동으로 종료 처리됩니다.
        </p>
        <div className="flex gap-3">
          <Link
            href="/admin/teams"
            className="rounded-lg bg-neutral-900 px-4 py-3 text-center text-white"
          >
            팀 코드 목록 보기
          </Link>
          <button
            onClick={handleReset}
            className="rounded-lg border border-neutral-300 px-4 py-3"
          >
            다른 대진표 업로드
          </button>
        </div>
      </div>
    );
  }

  if (step === "preview" && preview) {
    const hasErrors = preview.errors.length > 0;
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">
            미리보기: {preview.tournamentName}
          </h2>
          <p className="mt-1 text-sm text-neutral-600">
            팀 {preview.teams.length}개 / 경기 {preview.matches.length}개
          </p>
          <ul className="mt-2 text-sm text-neutral-600">
            {teamCountByDivision.map(([division, count]) => (
              <li key={division}>
                수준 {division}: {count}팀
              </li>
            ))}
          </ul>
        </div>

        {hasErrors && (
          <div className="rounded-lg border border-red-300 bg-red-50 p-4">
            <p className="mb-2 text-sm font-medium text-red-700">
              오류가 있어 업로드할 수 없습니다. 파일을 수정한 뒤 다시 업로드해주세요.
            </p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-red-700">
              {preview.errors.map((err, i) => (
                <li key={i}>
                  {err.row > 0 ? `${err.row}행: ` : ""}
                  {err.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        {preview.warnings.length > 0 && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
            <p className="mb-2 text-sm font-medium text-amber-700">경고</p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-amber-700">
              {preview.warnings.map((warn, i) => (
                <li key={i}>
                  {warn.row}행: {warn.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="max-h-80 overflow-auto rounded-lg border border-neutral-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-100 text-neutral-600">
              <tr>
                <th className="px-3 py-2">수준</th>
                <th className="px-3 py-2">라운드</th>
                <th className="px-3 py-2">팀A</th>
                <th className="px-3 py-2">팀B</th>
              </tr>
            </thead>
            <tbody>
              {preview.matches.map((m, i) => (
                <tr key={i} className="border-t border-neutral-200">
                  <td className="px-3 py-2">{m.division}</td>
                  <td className="px-3 py-2">{m.round}</td>
                  <td className="px-3 py-2">{m.teamAName}</td>
                  <td className="px-3 py-2">{m.teamBName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {result?.authError && (
          <p className="text-sm text-red-600">{result.authError}</p>
        )}

        <div className="flex gap-3">
          <button
            onClick={handleConfirm}
            disabled={hasErrors || pending}
            className="rounded-lg bg-neutral-900 px-4 py-3 text-white disabled:opacity-50"
          >
            {pending ? "업로드 중..." : "업로드 확정"}
          </button>
          <button
            onClick={handleReset}
            className="rounded-lg border border-neutral-300 px-4 py-3"
          >
            취소
          </button>
        </div>
      </div>
    );
  }

  return (
    <form ref={formRef} onSubmit={handlePreviewSubmit} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <label htmlFor="tournamentName" className="text-sm font-medium text-neutral-700">
          대회명
        </label>
        <input
          id="tournamentName"
          name="tournamentName"
          type="text"
          required
          placeholder="예: 2026 가을 피클볼 대회"
          className="rounded-lg border border-neutral-300 px-4 py-3 text-base focus:border-neutral-900 focus:outline-none"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="file" className="text-sm font-medium text-neutral-700">
          대진표 파일 (.xlsx, .csv)
        </label>
        <input
          id="file"
          name="file"
          type="file"
          accept=".xlsx,.xls,.csv"
          required
          className="rounded-lg border border-neutral-300 px-4 py-3 text-base"
        />
        <p className="text-xs text-neutral-500">
          필수 컬럼: 수준, 라운드, 팀A명, A선수1, A선수2, 팀B명, B선수1, B선수2
          (코트, 경기순서는 선택)
        </p>
      </div>

      {preview?.fileError && (
        <p className="text-sm text-red-600">{preview.fileError}</p>
      )}
      {preview?.authError && (
        <p className="text-sm text-red-600">{preview.authError}</p>
      )}

      <p className="text-xs text-neutral-500">
        업로드를 확정하면 새 대회가 시작되고, 이전에 활성화된 대회는 자동으로
        종료됩니다.
      </p>

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-neutral-900 px-4 py-3 text-white disabled:opacity-50"
      >
        {pending ? "확인 중..." : "미리보기"}
      </button>
    </form>
  );
}
