import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-10 px-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-neutral-900">피클볼 대회</h1>
        <p className="mt-2 text-sm text-neutral-500">
          수준별 복식 대회 경기 결과 기록
        </p>
      </div>

      <div className="flex w-full max-w-xs flex-col gap-4">
        <Link
          href="/join"
          className="rounded-xl bg-neutral-900 px-6 py-5 text-center text-lg font-medium text-white"
        >
          참가자 — 팀 코드 입력
        </Link>
        <Link
          href="/admin/login"
          className="rounded-xl border border-neutral-300 px-6 py-5 text-center text-lg font-medium text-neutral-700"
        >
          관리자
        </Link>
      </div>
    </main>
  );
}
