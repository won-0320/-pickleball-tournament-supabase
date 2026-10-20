import { redirect } from "next/navigation";
import { getTeam } from "@/lib/supabase/repo";
import { getTeamSession } from "@/lib/session/teamSession";
import JoinForm from "./JoinForm";

export default async function JoinPage() {
  // 이미 코드를 입력한 기기(24시간 쿠키)면 바로 팀 화면으로 보낸다.
  // 팀이 지워졌으면 팀 화면이 다시 /join으로 보내므로, 무한 리다이렉트를 막기 위해 팀이 있는지 확인한다.
  const session = await getTeamSession();
  if (session) {
    const team = await getTeam(session.tournamentId, session.teamId);
    if (team) {
      redirect(`/team/${session.teamId}`);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 px-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-neutral-900">팀 코드 입력</h1>
        <p className="mt-2 text-sm text-neutral-500">
          대회장에서 안내받은 4자리 팀 코드를 입력해주세요.
        </p>
      </div>
      <JoinForm />
    </main>
  );
}
