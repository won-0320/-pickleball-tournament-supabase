import Link from "next/link";
import { redirect } from "next/navigation";
import { getMyMatches, requireTeamSession, leaveTeamSession } from "@/app/actions/participant";
import { STATUS_BADGE_CLASSES, STATUS_LABELS } from "@/lib/matches/statusLabels";
import PollOnInterval from "@/lib/hooks/PollOnInterval";

export default async function TeamMatchesPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const session = await requireTeamSession();
  const { teamId } = await params;
  if (teamId !== session.teamId) {
    redirect(`/team/${session.teamId}`);
  }

  const { error, team, matches } = await getMyMatches();

  if (error || !team) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-neutral-700">{error ?? "팀 정보를 불러올 수 없습니다."}</p>
        <Link href="/join" className="text-sm text-neutral-500 underline">
          코드 다시 입력하기
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-dvh px-6 py-8">
      <PollOnInterval intervalMs={6000} />
      <div className="mx-auto max-w-md">
        <div className="mb-6">
          <p className="text-sm text-neutral-500">수준 {team.division}</p>
          <h1 className="text-2xl font-bold text-neutral-900">{team.teamName}</h1>
          <p className="text-sm text-neutral-600">
            {team.player1} / {team.player2}
          </p>
        </div>

        <ul className="flex flex-col gap-3">
          {matches.map((m) => {
            const isTeamA = m.teamAId === team.id;
            const opponentName = isTeamA ? m.teamBName : m.teamAName;
            return (
              <li key={m.id}>
                <Link
                  href={`/team/${team.id}/match/${m.id}`}
                  className="flex items-center justify-between rounded-xl border border-neutral-200 px-4 py-4 active:bg-neutral-50"
                >
                  <div>
                    <p className="text-xs text-neutral-500">{m.round}</p>
                    <p className="text-base font-medium text-neutral-900">
                      vs {opponentName}
                    </p>
                    {m.scoreA !== null && m.scoreB !== null && (
                      <p className="text-sm text-neutral-500">
                        {isTeamA ? `${m.scoreA} : ${m.scoreB}` : `${m.scoreB} : ${m.scoreA}`}
                      </p>
                    )}
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_BADGE_CLASSES[m.status]}`}
                  >
                    {STATUS_LABELS[m.status]}
                  </span>
                </Link>
              </li>
            );
          })}
          {matches.length === 0 && (
            <li className="rounded-xl border border-dashed border-neutral-300 px-4 py-6 text-center text-sm text-neutral-400">
              배정된 경기가 없습니다.
            </li>
          )}
        </ul>

        <form action={leaveTeamSession} className="mt-8 text-center">
          <button type="submit" className="text-sm text-neutral-400 underline">
            다른 코드로 다시 입장
          </button>
        </form>
      </div>
    </main>
  );
}
