import { listTournaments, requireAdmin } from "@/app/actions/admin";
import AdminNav from "../AdminNav";
import TournamentList from "./TournamentList";

export default async function AdminTournamentsPage() {
  await requireAdmin();
  const { tournaments } = await listTournaments();

  return (
    <main className="min-h-dvh">
      <AdminNav />
      <div className="mx-auto max-w-4xl px-6 py-8">
        <h1 className="mb-1 text-2xl font-bold text-neutral-900">대회 관리</h1>
        <p className="mb-6 text-sm text-neutral-500">
          지금까지 업로드한 모든 대회 목록입니다. 필요 없는 대회는 삭제할 수 있습니다.
        </p>
        <TournamentList tournaments={tournaments} />
      </div>
    </main>
  );
}
