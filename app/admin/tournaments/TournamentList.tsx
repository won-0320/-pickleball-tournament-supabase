"use client";

import { useState, useTransition } from "react";
import { deleteTournament, type TournamentListItem } from "@/app/actions/admin";

const STATUS_LABELS: Record<TournamentListItem["status"], string> = {
  draft: "초안",
  active: "활성",
  closed: "종료",
};

const STATUS_CLASSES: Record<TournamentListItem["status"], string> = {
  draft: "bg-neutral-100 text-neutral-600",
  active: "bg-emerald-100 text-emerald-700",
  closed: "bg-neutral-100 text-neutral-500",
};

export default function TournamentList({ tournaments }: { tournaments: TournamentListItem[] }) {
  const [items, setItems] = useState(tournaments);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function handleDelete(t: TournamentListItem) {
    const confirmed = window.confirm(
      `"${t.name}" 대회를 삭제할까요? 팀 ${t.teamCount}개, 경기 ${t.matchCount}건이 모두 함께 삭제되며 되돌릴 수 없습니다.`
    );
    if (!confirmed) return;

    setError(null);
    setPendingId(t.id);
    startTransition(async () => {
      const res = await deleteTournament(t.id);
      setPendingId(null);
      if (res.error) {
        setError(res.error);
        return;
      }
      setItems((prev) => prev.filter((x) => x.id !== t.id));
    });
  }

  if (items.length === 0) {
    return <p className="text-sm text-neutral-400">업로드된 대회가 없습니다.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="overflow-auto rounded-lg border border-neutral-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-100 text-neutral-600">
            <tr>
              <th className="px-3 py-2">대회명</th>
              <th className="px-3 py-2">상태</th>
              <th className="px-3 py-2">생성일시</th>
              <th className="px-3 py-2">팀</th>
              <th className="px-3 py-2">경기</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((t) => (
              <tr key={t.id} className="border-t border-neutral-200">
                <td className="px-3 py-2">{t.name}</td>
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2 py-1 text-xs font-medium ${STATUS_CLASSES[t.status]}`}>
                    {STATUS_LABELS[t.status]}
                  </span>
                </td>
                <td className="px-3 py-2 text-neutral-500">
                  {new Date(t.createdAt).toLocaleString("ko-KR")}
                </td>
                <td className="px-3 py-2">{t.teamCount}</td>
                <td className="px-3 py-2">{t.matchCount}</td>
                <td className="px-3 py-2 text-right">
                  <button
                    onClick={() => handleDelete(t)}
                    disabled={pendingId === t.id}
                    className="text-sm text-red-600 underline disabled:opacity-50"
                  >
                    {pendingId === t.id ? "삭제 중..." : "삭제"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
