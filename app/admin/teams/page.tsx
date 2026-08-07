import { listTeams, requireAdmin } from "@/app/actions/admin";
import AdminNav from "../AdminNav";
import TeamCodeTable from "./TeamCodeTable";

export default async function AdminTeamsPage() {
  await requireAdmin();
  const { tournament, teams } = await listTeams();

  return (
    <main className="min-h-dvh">
      <div className="print:hidden">
        <AdminNav />
      </div>
      <div className="mx-auto max-w-4xl px-6 py-8">
        <h1 className="mb-1 text-2xl font-bold text-neutral-900">팀 코드 목록</h1>
        {tournament ? (
          <p className="mb-6 text-sm text-neutral-500">{tournament.name}</p>
        ) : (
          <p className="mb-6 text-sm text-neutral-500">
            활성화된 대회가 없습니다. 먼저 대진표를 업로드해주세요.
          </p>
        )}
        <TeamCodeTable teams={teams} />
      </div>
    </main>
  );
}
