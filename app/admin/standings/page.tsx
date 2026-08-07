import { listTeams, getDivisionStandings, requireAdmin } from "@/app/actions/admin";
import AdminNav from "../AdminNav";
import StandingsBoard from "./StandingsBoard";
import PollOnInterval from "@/lib/hooks/PollOnInterval";

export default async function AdminStandingsPage() {
  await requireAdmin();
  const { tournament } = await listTeams();
  const divisions = tournament?.divisions ?? [];
  const initialDivision = divisions[0] ?? "";
  const initial = initialDivision ? await getDivisionStandings(initialDivision) : null;

  return (
    <main className="min-h-dvh">
      <PollOnInterval intervalMs={5000} />
      <AdminNav />
      <div className="mx-auto max-w-4xl px-6 py-8">
        <h1 className="mb-1 text-2xl font-bold text-neutral-900">
          그룹 순위 · 토너먼트 대진 생성
        </h1>
        {tournament ? (
          <p className="mb-6 text-sm text-neutral-500">{tournament.name}</p>
        ) : (
          <p className="mb-6 text-sm text-neutral-500">
            활성화된 대회가 없습니다. 먼저 대진표를 업로드해주세요.
          </p>
        )}
        {divisions.length > 0 && initial && (
          <StandingsBoard divisions={divisions} initialDivision={initialDivision} initialData={initial} />
        )}
      </div>
    </main>
  );
}
