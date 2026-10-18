import Link from "next/link";
import { redirect } from "next/navigation";
import {
  getMyMatches,
  getMyDivisionView,
  requireTeamSession,
  leaveTeamSession,
} from "@/app/actions/participant";
import PodiumCard from "@/app/components/PodiumCard";
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

  const [{ error, team, matches }, divisionView] = await Promise.all([
    getMyMatches(),
    getMyDivisionView(),
  ]);

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
  const schedule = divisionView?.groupSchedule ?? [];
  const wait = divisionView?.wait ?? null;
  const positions = schedulePositions(schedule, wait?.remaining ?? 0);
  // 팀 수가 홀수면 라운드마다 한 팀씩 쉰다 — 우리 팀이 경기가 없는 라운드.
  const restRounds = Array.from(new Set(schedule.map((m) => m.round))).filter(
    (round) => !schedule.some((m) => m.round === round && (m.teamAId === team.id || m.teamBId === team.id))
  );

  return (
    <main className="min-h-dvh px-6 py-8">
      <PollOnInterval intervalMs={20000} />
      <div className="mx-auto max-w-md">
        <div className="mb-6">
          <p className="text-sm text-neutral-500">부문 {team.division} · {team.group}조</p>
          <h1 className="text-2xl font-bold text-neutral-900">{team.teamName}</h1>
          <p className="text-sm text-neutral-600">
            {team.player1} / {team.player2}
          </p>
        </div>

        {wait && (
          <section className="mb-6 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
            <p className="font-medium">부문 {team.division}은 {wait.label}</p>
            <p className="mt-1 text-sky-700">먼저 진행되는 경기 {wait.remaining}경기가 남았습니다.</p>
          </section>
        )}

        {divisionView && divisionView.podium.length > 0 && (
          <section className="mb-6">
            <PodiumCard
              title={`부문 ${team.division} 최종 결과`}
              podium={divisionView.podium}
              highlightTeamId={team.id}
            />
          </section>
        )}

        {divisionView && divisionView.standings.length > 0 && (
          <section className="mb-6">
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="text-sm font-semibold text-neutral-500">{team.group}조 순위</h2>
              <p className="text-xs text-neutral-400">
                {divisionView.groupConfirmed}/{divisionView.groupTotal}경기 확정 · 승점 → 승자승
              </p>
            </div>
            <table className="w-full overflow-hidden rounded-xl border border-neutral-200 text-center text-sm">
              <thead className="bg-neutral-50 text-xs text-neutral-500">
                <tr>
                  <th className="px-2 py-2">순위</th>
                  <th className="px-2 py-2 text-left">팀</th>
                  <th className="px-2 py-2">승</th>
                  <th className="px-2 py-2">패</th>
                  <th className="px-2 py-2">승점</th>
                </tr>
              </thead>
              <tbody>
                {divisionView.standings.map((s) => (
                  <tr
                    key={s.teamId}
                    className={`border-t border-neutral-100 ${
                      s.teamId === team.id ? "bg-neutral-100 font-semibold" : ""
                    }`}
                  >
                    <td className="px-2 py-2">{s.rank}</td>
                    <td className="px-2 py-2 text-left">{s.teamName}</td>
                    <td className="px-2 py-2">{s.wins}</td>
                    <td className="px-2 py-2">{s.losses}</td>
                    <td className="px-2 py-2">{s.leaguePoints}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {groupMatches.length > 0 && (
          <section className="mb-6">
            <h2 className="mb-2 text-sm font-semibold text-neutral-500">우리 팀 조별리그 경기</h2>
            <MatchList matches={groupMatches} teamId={team.id} positions={positions} />
          </section>
        )}

        {schedule.length > 0 && (
          <section className="mb-6">
            <h2 className="mb-2 text-sm font-semibold text-neutral-500">{team.group}조 전체 경기 순서</h2>
            <GroupSchedule schedule={schedule} teamId={team.id} waiting={wait !== null} />
            {restRounds.length > 0 && (
              <p className="mt-2 text-xs text-neutral-500">우리 팀 쉬는 라운드: {restRounds.join(", ")}</p>
            )}
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

interface SchedulePosition {
  seq: number; // 조 전체 경기 중 몇 번째 (1-based)
  ahead: number; // 이 경기 앞에 아직 확정되지 않은 경기 수
}

/** 조 전체 경기 순서에서 각 경기의 위치와, 앞에 남은 미확정 경기 수. */
function schedulePositions(schedule: Match[], waitingBefore: number): Map<string, SchedulePosition> {
  const positions = new Map<string, SchedulePosition>();
  let unconfirmedSoFar = waitingBefore; // 먼저 진행되는 다른 부문의 남은 경기
  schedule.forEach((m, i) => {
    positions.set(m.id, { seq: i + 1, ahead: unconfirmedSoFar });
    if (m.status !== "confirmed") unconfirmedSoFar += 1;
  });
  return positions;
}

function GroupSchedule({
  schedule,
  teamId,
  waiting,
}: {
  schedule: Match[];
  teamId: string;
  waiting: boolean;
}) {
  const nextId = waiting ? undefined : schedule.find((m) => m.status !== "confirmed")?.id;
  return (
    <ol className="flex flex-col divide-y divide-neutral-100 rounded-xl border border-neutral-200 text-sm">
      {schedule.map((m, i) => {
        const mine = m.teamAId === teamId || m.teamBId === teamId;
        const row = (
          <div className={`flex items-center gap-3 px-3 py-2 ${mine ? "bg-neutral-100 font-semibold" : ""}`}>
            <span className="w-6 text-center text-neutral-400">{i + 1}</span>
            <span className="flex-1">
              {m.teamAName} <span className="text-neutral-400">vs</span> {m.teamBName}
              <span className="block text-xs font-normal text-neutral-400">{m.round}</span>
            </span>
            {m.status === "confirmed" ? (
              <span className="text-neutral-500">
                {m.scoreA} : {m.scoreB}
              </span>
            ) : m.id === nextId ? (
              <span className="rounded-full bg-neutral-900 px-2 py-0.5 text-xs font-medium text-white">
                다음 차례
              </span>
            ) : (
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASSES[m.status]}`}>
                {STATUS_LABELS[m.status]}
              </span>
            )}
          </div>
        );
        return (
          <li key={m.id}>
            {mine ? <Link href={`/team/${teamId}/match/${m.id}`}>{row}</Link> : row}
          </li>
        );
      })}
    </ol>
  );
}

function MatchList({
  matches,
  teamId,
  positions,
}: {
  matches: Match[];
  teamId: string;
  positions?: Map<string, SchedulePosition>;
}) {
  return (
    <ul className="flex flex-col gap-3">
      {matches.map((m) => {
        const isTeamA = m.teamAId === teamId;
        const opponentName = isTeamA ? m.teamBName : m.teamAName;
        const opponentLabel = opponentName ?? (m.isBye ? "부전승" : "상대 결정 대기");
        const pos = positions?.get(m.id);

        return (
          <li key={m.id}>
            <Link
              href={`/team/${teamId}/match/${m.id}`}
              className="flex items-center justify-between rounded-xl border border-neutral-200 px-4 py-4 active:bg-neutral-50"
            >
              <div>
                <p className="text-xs text-neutral-500">
                  {pos && <span className="font-semibold text-neutral-700">{pos.seq}번째 경기 · </span>}
                  {m.round}
                </p>
                {pos && m.status !== "confirmed" && (
                  <p className="text-xs text-neutral-500">
                    {pos.ahead === 0 ? "지금 차례입니다" : `앞에 ${pos.ahead}경기 남음`}
                  </p>
                )}
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
