import type { FirestoreDataConverter, QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getDb } from "./admin";
import type { Match, Team, Tournament } from "@/types/domain";

function converter<T extends { id: string }>(): FirestoreDataConverter<T> {
  return {
    toFirestore(model: T) {
      const rest: Partial<T> = { ...model };
      delete rest.id;
      return rest;
    },
    fromFirestore(snap: QueryDocumentSnapshot) {
      return { id: snap.id, ...snap.data() } as T;
    },
  };
}

export function tournamentsCol() {
  return getDb().collection("tournaments").withConverter(converter<Tournament>());
}

export function tournamentDoc(tournamentId: string) {
  return tournamentsCol().doc(tournamentId);
}

export function teamsCol(tournamentId: string) {
  return tournamentDoc(tournamentId)
    .collection("teams")
    .withConverter(converter<Team>());
}

export function teamDoc(tournamentId: string, teamId: string) {
  return teamsCol(tournamentId).doc(teamId);
}

export function matchesCol(tournamentId: string) {
  return tournamentDoc(tournamentId)
    .collection("matches")
    .withConverter(converter<Match>());
}

export function matchDoc(tournamentId: string, matchId: string) {
  return matchesCol(tournamentId).doc(matchId);
}

/**
 * v1 assumes a single active tournament at a time. Returns the most
 * recently created tournament with status "active", or null if none.
 */
export async function getActiveTournament(): Promise<Tournament | null> {
  const snap = await tournamentsCol().where("status", "==", "active").get();
  if (snap.empty) return null;
  const tournaments = snap.docs.map((d) => d.data());
  tournaments.sort((a, b) => b.createdAt - a.createdAt);
  return tournaments[0]!;
}
