import JoinForm from "./JoinForm";

export default function JoinPage() {
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
