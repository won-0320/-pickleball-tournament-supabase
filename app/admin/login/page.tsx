import LoginForm from "./LoginForm";

export default function AdminLoginPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 px-6">
      <h1 className="text-2xl font-bold text-neutral-900">관리자 로그인</h1>
      <LoginForm />
    </main>
  );
}
