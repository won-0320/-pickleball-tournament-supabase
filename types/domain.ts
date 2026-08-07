export type TournamentStatus = "draft" | "active" | "closed";

export interface Tournament {
  id: string;
  name: string;
  status: TournamentStatus;
  divisions: string[];
  createdAt: number;
  bracketUploadedAt: number | null;
}

export interface Team {
  id: string;
  tournamentId: string;
  code: string;
  division: string;
  teamName: string;
  player1: string;
  player2: string;
  createdAt: number;
}

export type MatchStatus =
  | "pending"
  | "awaiting_confirmation"
  | "confirmed"
  | "disputed";

export type MatchSide = "teamA" | "teamB";

export interface Match {
  id: string;
  tournamentId: string;
  division: string;
  round: string;
  order: number | null;
  court: string | null;
  teamAId: string;
  teamBId: string;
  teamAName: string;
  teamBName: string;
  scoreA: number | null;
  scoreB: number | null;
  status: MatchStatus;
  submittedBy: MatchSide | null;
  submittedScoreA: number | null;
  submittedScoreB: number | null;
  opponentScoreA: number | null;
  opponentScoreB: number | null;
  resolvedBy: "confirmation" | "admin" | null;
  createdAt: number;
  updatedAt: number;
}
