import Link from "next/link";
import { redirect } from "next/navigation";
import { getMyMatch, requireTeamSession } from "@/app/actions/participant";
import MatchDetail from "./MatchDetail";
import PollOnInterval from "@/lib/hooks/PollOnInterval";

export default async function TeamMatchPage({
  params,
}: {
  params: Promise<{ teamId: string; matchId: string }>;
}) {
  const session = await requireTeamSession();
  const { teamId, matchId } = await params;
  if (teamId !== session.teamId) {
    redirect(`/team/${session.teamId}`);
  }

  const { error, match, side } = await getMyMatch(matchId);

  if (error || !match || !side) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-neutral-700">{error ?? "경기 정보를 불러올 수 없습니다."}</p>
        <Link href={`/team/${session.teamId}`} className="text-sm text-neutral-500 underline">
          경기 목록으로
        </Link>
      </main>
    );
  }

  const ownTeamName = side === "teamA" ? match.teamAName : match.teamBName;
  const opponentTeamName = side === "teamA" ? match.teamBName : match.teamAName;

  return (
    <main className="min-h-dvh px-6 py-8">
      <PollOnInterval intervalMs={10000} />
      <div className="mx-auto max-w-md">
        <Link
          href={`/team/${session.teamId}`}
          className="mb-4 inline-block text-sm text-neutral-400 underline"
        >
          ← 경기 목록
        </Link>
        <MatchDetail
          match={match}
          side={side}
          ownTeamName={ownTeamName}
          opponentTeamName={opponentTeamName}
        />
      </div>
    </main>
  );
}
