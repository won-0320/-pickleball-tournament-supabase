import { getDb } from "./client";
import { col, fromRow, toRow } from "./mappers";
import type { Match, Team, Tournament } from "@/types/domain";

/**
 * Every read/write the app does against Supabase. Replaces the old Firestore
 * collection helpers; callers work only with domain objects.
 */

const PAGE_SIZE = 1000; // PostgREST returns at most 1000 rows per request
const INSERT_CHUNK_SIZE = 500;

interface SupabaseResult<T> {
  data: T | null;
  error: { message: string } | null;
}

function unwrap<T>({ data, error }: SupabaseResult<T>): T {
  if (error) throw new Error(`Supabase 오류: ${error.message}`);
  return data as T;
}

function selectFrom(table: string) {
  return getDb().from(table).select("*");
}

type Query = ReturnType<typeof selectFrom>;
type Filter = (q: Query) => Query;

/** Reads every matching row, paging past the 1000-row response cap. */
async function selectAll<T>(table: string, filter: Filter): Promise<T[]> {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const page = unwrap(
      await filter(selectFrom(table))
        .order("id")
        .range(from, from + PAGE_SIZE - 1)
    ) as Record<string, unknown>[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows.map((r) => fromRow<T>(r));
}

async function selectOne<T>(table: string, filter: Filter): Promise<T | null> {
  const row = unwrap(await filter(selectFrom(table)).maybeSingle()) as Record<
    string,
    unknown
  > | null;
  return row ? fromRow<T>(row) : null;
}

async function insertAll(table: string, items: object[]): Promise<void> {
  for (let i = 0; i < items.length; i += INSERT_CHUNK_SIZE) {
    unwrap(await getDb().from(table).insert(items.slice(i, i + INSERT_CHUNK_SIZE).map(toRow)));
  }
}

async function count(table: string, tournamentId: string): Promise<number> {
  const { count: n, error } = await getDb()
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("tournament_id", tournamentId);
  if (error) throw new Error(`Supabase 오류: ${error.message}`);
  return n ?? 0;
}

export function newId(): string {
  return crypto.randomUUID();
}

// ── tournaments ──────────────────────────────────────────────

export function listTournaments(status?: Tournament["status"]): Promise<Tournament[]> {
  return selectAll<Tournament>("tournaments", (q) => (status ? q.eq("status", status) : q));
}

export function getTournament(tournamentId: string): Promise<Tournament | null> {
  return selectOne<Tournament>("tournaments", (q) => q.eq("id", tournamentId));
}

/**
 * v1 assumes a single active tournament at a time. Returns the most
 * recently created tournament with status "active", or null if none.
 */
export async function getActiveTournament(): Promise<Tournament | null> {
  const tournaments = await listTournaments("active");
  if (tournaments.length === 0) return null;
  tournaments.sort((a, b) => b.createdAt - a.createdAt);
  return tournaments[0]!;
}

export async function insertTournament(tournament: Tournament): Promise<void> {
  await insertAll("tournaments", [tournament]);
}

export async function updateTournament(
  tournamentId: string,
  patch: Partial<Tournament>
): Promise<void> {
  unwrap(await getDb().from("tournaments").update(toRow(patch)).eq("id", tournamentId));
}

/** Teams and matches go with it via ON DELETE CASCADE. */
export async function deleteTournament(tournamentId: string): Promise<void> {
  unwrap(await getDb().from("tournaments").delete().eq("id", tournamentId));
}

// ── teams ────────────────────────────────────────────────────

export function listTeams(
  tournamentId: string,
  opts: { division?: string } = {}
): Promise<Team[]> {
  return selectAll<Team>("teams", (q) => {
    let r = q.eq("tournament_id", tournamentId);
    if (opts.division !== undefined) r = r.eq("division", opts.division);
    return r;
  });
}

export function getTeam(tournamentId: string, teamId: string): Promise<Team | null> {
  return selectOne<Team>("teams", (q) => q.eq("tournament_id", tournamentId).eq("id", teamId));
}

export async function findTeamByCode(tournamentId: string, code: string): Promise<Team | null> {
  const row = unwrap(
    await getDb()
      .from("teams")
      .select("*")
      .eq("tournament_id", tournamentId)
      .eq("code", code)
      .limit(1)
  ) as Record<string, unknown>[];
  return row[0] ? fromRow<Team>(row[0]) : null;
}

export function insertTeams(teams: Team[]): Promise<void> {
  return insertAll("teams", teams);
}

export function countTeams(tournamentId: string): Promise<number> {
  return count("teams", tournamentId);
}

// ── matches ──────────────────────────────────────────────────

export function listMatches(
  tournamentId: string,
  opts: { divisions?: string[]; teamId?: string } = {}
): Promise<Match[]> {
  return selectAll<Match>("matches", (q) => {
    let r = q.eq("tournament_id", tournamentId);
    if (opts.divisions) r = r.in("division", opts.divisions);
    if (opts.teamId) r = r.or(`team_a_id.eq.${opts.teamId},team_b_id.eq.${opts.teamId}`);
    return r;
  });
}

export function getMatch(tournamentId: string, matchId: string): Promise<Match | null> {
  return selectOne<Match>("matches", (q) => q.eq("tournament_id", tournamentId).eq("id", matchId));
}

export function insertMatches(matches: Match[]): Promise<void> {
  return insertAll("matches", matches);
}

export async function updateMatch(
  tournamentId: string,
  matchId: string,
  patch: Partial<Match>
): Promise<void> {
  unwrap(
    await getDb()
      .from("matches")
      .update(toRow(patch))
      .eq("tournament_id", tournamentId)
      .eq("id", matchId)
  );
}

/**
 * Optimistic-lock update: applies the patch only if the match's updatedAt is
 * still the value the caller read. Returns false if someone wrote in between.
 */
export async function updateMatchIfUnchanged(
  tournamentId: string,
  matchId: string,
  expectedUpdatedAt: number,
  patch: Partial<Match>
): Promise<boolean> {
  const rows = unwrap(
    await getDb()
      .from("matches")
      .update(toRow(patch))
      .eq("tournament_id", tournamentId)
      .eq("id", matchId)
      .eq(col("updatedAt"), expectedUpdatedAt)
      .select("id")
  ) as unknown[];
  return rows.length > 0;
}

export async function deleteMatches(tournamentId: string, matchIds: string[]): Promise<void> {
  for (let i = 0; i < matchIds.length; i += INSERT_CHUNK_SIZE) {
    unwrap(
      await getDb()
        .from("matches")
        .delete()
        .eq("tournament_id", tournamentId)
        .in("id", matchIds.slice(i, i + INSERT_CHUNK_SIZE))
    );
  }
}

export function countMatches(tournamentId: string): Promise<number> {
  return count("matches", tournamentId);
}
