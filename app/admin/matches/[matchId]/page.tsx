import Link from "next/link";
import { getAdminMatch, requireAdmin } from "@/app/actions/admin";
import AdminNav from "../../AdminNav";
import MatchAdminDetail from "./MatchAdminDetail";
import PollOnInterval from "@/lib/hooks/PollOnInterval";

export default async function AdminMatchDetailPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  await requireAdmin();
  const { matchId } = await params;
  const { authError, match, teamA, teamB } = await getAdminMatch(matchId);

  return (
    <main className="min-h-dvh">
      <PollOnInterval intervalMs={15000} />
      <AdminNav />
      <div className="mx-auto max-w-2xl px-6 py-8">
        <Link href="/admin/matches" className="mb-4 inline-block text-sm text-neutral-400 underline">
          ← 경기 현황
        </Link>
        {authError || !match ? (
          <p className="text-neutral-700">{authError ?? "경기를 찾을 수 없습니다."}</p>
        ) : (
          <MatchAdminDetail match={match} teamA={teamA} teamB={teamB} />
        )}
      </div>
    </main>
  );
}
