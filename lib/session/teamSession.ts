import "server-only";
import { cookies } from "next/headers";
import { signSession, verifySession } from "./jwt";

const COOKIE_NAME = "team_session";
const MAX_AGE_SECONDS = 60 * 60 * 24; // 24 hours — covers a single tournament day

export interface TeamSessionPayload {
  tournamentId: string;
  teamId: string;
}

export async function createTeamSession(
  payload: TeamSessionPayload
): Promise<void> {
  const token = await signSession({ ...payload }, "24h");
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function getTeamSession(): Promise<TeamSessionPayload | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const payload = await verifySession<
    TeamSessionPayload & Record<string, unknown>
  >(token);
  if (!payload?.tournamentId || !payload?.teamId) return null;

  return { tournamentId: payload.tournamentId, teamId: payload.teamId };
}

export async function destroyTeamSession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}
