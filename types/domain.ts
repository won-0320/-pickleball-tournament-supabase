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
  group: string | null; // "조" — 새 파이프라인에서 생성되는 팀은 항상 non-null
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

export type MatchStage = "group" | "knockout";

export interface Match {
  id: string;
  tournamentId: string;
  division: string;
  stage: MatchStage;
  group: string | null; // stage === "group"일 때만 값 있음
  round: string;
  roundIndex: number | null; // 라운드 자연 정렬용 (0-based), round는 한글 라벨이라 문자열 정렬 불가
  order: number | null;
  court: string | null;
  teamAId: string | null; // 토너먼트 다음 라운드는 상대가 정해지기 전까지 null
  teamBId: string | null;
  teamAName: string | null;
  teamBName: string | null;
  scoreA: number | null;
  scoreB: number | null;
  status: MatchStatus;
  submittedBy: MatchSide | null;
  submittedScoreA: number | null;
  submittedScoreB: number | null;
  opponentScoreA: number | null;
  opponentScoreB: number | null;
  resolvedBy: "confirmation" | "admin" | "bye" | null;
  isBye: boolean;
  nextMatchId: string | null; // knockout 전용: 이 경기 승자가 채워질 다음 경기
  nextMatchSlot: MatchSide | null; // 다음 경기의 어느 슬롯인지
  createdAt: number;
  updatedAt: number;
}
