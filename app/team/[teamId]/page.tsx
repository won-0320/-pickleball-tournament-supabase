import Link from "next/link";
import { redirect } from "next/navigation";
import { getMyMatches, requireTeamSession, leaveTeamSession } from "@/app/actions/participant";
import { STATUS_BADGE_CLASSES, STATUS_LABELS } from "@/lib/matches/statusLabels";
import PollOnInterval from "@/lib/hooks/PollOnInterval";
import type { Match } from "@/types/domain";

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

  const groupMatches = matches.filter((m) => m.stage === "group");
  const knockoutMatches = matches.filter((m) => m.stage === "knockout");

  return (
    <main className="min-h-dvh px-6 py-8">
      <PollOnInterval intervalMs={6000} />
      <div className="mx-auto max-w-md">
        <div className="mb-6">
          <p className="text-sm text-neutral-500">수준 {team.division} · {team.group}조</p>
          <h1 className="text-2xl font-bold text-neutral-900">{team.teamName}</h1>
          <p className="text-sm text-neutral-600">
            {team.player1} / {team.player2}
          </p>
        </div>

        {groupMatches.length > 0 && (
          <section className="mb-6">
            <h2 className="mb-2 text-sm font-semibold text-neutral-500">조별리그</h2>
            <MatchList matches={groupMatches} teamId={team.id} />
          </section>
        )}

        {knockoutMatches.length > 0 && (
          <section className="mb-6">
            <h2 className="mb-2 text-sm font-semibold text-neutral-500">토너먼트</h2>
            <MatchList matches={knockoutMatches} teamId={team.id} />
          </section>
        )}

        {matches.length === 0 && (
          <p className="rounded-xl border border-dashed border-neutral-300 px-4 py-6 text-center text-sm text-neutral-400">
            배정된 경기가 없습니다.
          </p>
        )}

        <form action={leaveTeamSession} className="mt-8 text-center">
          <button type="submit" className="text-sm text-neutral-400 underline">
            다른 코드로 다시 입장
          </button>
        </form>
      </div>
    </main>
  );
}

function MatchList({ matches, teamId }: { matches: Match[]; teamId: string }) {
  return (
    <ul className="flex flex-col gap-3">
      {matches.map((m) => {
        const isTeamA = m.teamAId === teamId;
        const opponentName = isTeamA ? m.teamBName : m.teamAName;
        const opponentLabel = opponentName ?? (m.isBye ? "부전승" : "상대 결정 대기");

        return (
          <li key={m.id}>
            <Link
              href={`/team/${teamId}/match/${m.id}`}
              className="flex items-center justify-between rounded-xl border border-neutral-200 px-4 py-4 active:bg-neutral-50"
            >
              <div>
                <p className="text-xs text-neutral-500">{m.round}</p>
                <p className="text-base font-medium text-neutral-900">vs {opponentLabel}</p>
                {m.scoreA !== null && m.scoreB !== null && (
                  <p className="text-sm text-neutral-500">
                    {isTeamA ? `${m.scoreA} : ${m.scoreB}` : `${m.scoreB} : ${m.scoreA}`}
                  </p>
                )}
              </div>
              {m.isBye ? (
                <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-medium text-sky-700">
                  부전승
                </span>
              ) : (
                <span
                  className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_BADGE_CLASSES[m.status]}`}
                >
                  {STATUS_LABELS[m.status]}
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
