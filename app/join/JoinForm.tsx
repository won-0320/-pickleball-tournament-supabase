"use client";

import { useActionState } from "react";
import { joinWithCode, type JoinState } from "@/app/actions/participant";

const initialState: JoinState = { error: null };

export default function JoinForm() {
  const [state, formAction, pending] = useActionState(joinWithCode, initialState);

  return (
    <form action={formAction} className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="code" className="text-sm font-medium text-neutral-700">
          팀 코드
        </label>
        <input
          id="code"
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          maxLength={8}
          required
          placeholder="예: 4821"
          className="rounded-lg border border-neutral-300 px-4 py-4 text-center text-2xl tracking-[0.3em] focus:border-neutral-900 focus:outline-none"
        />
      </div>

      {state.error && (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-neutral-900 px-4 py-4 text-lg font-medium text-white disabled:opacity-50"
      >
        {pending ? "확인 중..." : "입장하기"}
      </button>
    </form>
  );
}
