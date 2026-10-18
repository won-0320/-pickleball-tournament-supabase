import { listMatches, requireAdmin } from "@/app/actions/admin";
import AdminNav from "../AdminNav";
import MatchesDashboard from "./MatchesDashboard";
import PollOnInterval from "@/lib/hooks/PollOnInterval";

export default async function AdminMatchesPage() {
  await requireAdmin();
  const { tournament, matches } = await listMatches();

  return (
    <main className="min-h-dvh">
      <PollOnInterval intervalMs={15000} />
      <AdminNav />
      <div className="mx-auto max-w-5xl px-6 py-8">
        <h1 className="mb-1 text-2xl font-bold text-neutral-900">경기 현황</h1>
        {tournament ? (
          <p className="mb-6 text-sm text-neutral-500">{tournament.name}</p>
        ) : (
          <p className="mb-6 text-sm text-neutral-500">
            활성화된 대회가 없습니다. 먼저 대진표를 업로드해주세요.
          </p>
        )}
        <MatchesDashboard matches={matches} />
      </div>
    </main>
  );
}
