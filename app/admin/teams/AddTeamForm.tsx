"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addTeam } from "@/app/actions/admin";

export default function AddTeamForm({
  divisions,
  groups,
}: {
  divisions: string[];
  groups: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [successCode, setSuccessCode] = useState<string | null>(null);

  const [division, setDivision] = useState("");
  const [group, setGroup] = useState("");
  const [teamName, setTeamName] = useState("");
  const [player1, setPlayer1] = useState("");
  const [player2, setPlayer2] = useState("");

  function resetFields() {
    setDivision("");
    setGroup("");
    setTeamName("");
    setPlayer1("");
    setPlayer2("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessCode(null);
    startTransition(async () => {
      const res = await addTeam({ division, group, teamName, player1, player2 });
      if (res.error) {
        setError(res.error);
        return;
      }
      setSuccessCode(res.team?.code ?? null);
      resetFields();
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-fit rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 print:hidden"
      >
        + 팀 추가
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-4 print:hidden"
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-neutral-700">팀 추가</p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm text-neutral-400 underline"
        >
          닫기
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-neutral-500">부문</label>
          <input
            list="existing-divisions"
            value={division}
            onChange={(e) => setDivision(e.target.value)}
            required
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
          />
          <datalist id="existing-divisions">
            {divisions.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-neutral-500">조</label>
          <input
            list="existing-groups"
            value={group}
            onChange={(e) => setGroup(e.target.value)}
            required
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
          />
          <datalist id="existing-groups">
            {groups.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-neutral-500">팀명</label>
        <input
          value={teamName}
          onChange={(e) => setTeamName(e.target.value)}
          required
          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-neutral-500">선수1</label>
          <input
            value={player1}
            onChange={(e) => setPlayer1(e.target.value)}
            required
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-neutral-500">선수2</label>
          <input
            value={player2}
            onChange={(e) => setPlayer2(e.target.value)}
            required
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {successCode && (
        <p className="text-sm text-emerald-600">
          팀이 추가되었습니다. 발급된 코드: <span className="font-mono font-semibold">{successCode}</span>
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-fit rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "추가 중..." : "추가"}
      </button>
    </form>
  );
}
