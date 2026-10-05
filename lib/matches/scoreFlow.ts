import type { Match, MatchSide } from "@/types/domain";

export interface ScoreFlowError {
  code: "invalid_score" | "wrong_state" | "own_submission" | "opponent_tbd";
  message: string;
}

export type ScoreFlowResult =
  | { ok: true; patch: Partial<Match> }
  | { ok: false; error: ScoreFlowError };

function validateScores(scoreOwn: number, scoreOpponent: number): ScoreFlowError | null {
  if (
    !Number.isInteger(scoreOwn) ||
    !Number.isInteger(scoreOpponent) ||
    scoreOwn < 0 ||
    scoreOpponent < 0
  ) {
    return { code: "invalid_score", message: "점수는 0 이상의 정수여야 합니다." };
  }
  if (scoreOwn === scoreOpponent) {
    return { code: "invalid_score", message: "두 팀의 점수가 같을 수 없습니다." };
  }
  return null;
}

function otherSide(side: MatchSide): MatchSide {
  return side === "teamA" ? "teamB" : "teamA";
}

/**
 * First score submission for a match. Only allowed while the match is
 * still "pending" (no one has submitted yet). Moves the match into
 * "awaiting_confirmation" without setting the authoritative score.
 */
export function submitScore(
  match: Match,
  side: MatchSide,
  scoreA: number,
  scoreB: number,
  now: number
): ScoreFlowResult {
  if (match.status !== "pending") {
    return {
      ok: false,
      error: {
        code: "wrong_state",
        message: "이미 점수가 제출된 경기입니다.",
      },
    };
  }

  if (match.isBye || match.teamAId === null || match.teamBId === null) {
    return {
      ok: false,
      error: {
        code: "opponent_tbd",
        message: "상대팀이 아직 결정되지 않았습니다.",
      },
    };
  }

  const ownScore = side === "teamA" ? scoreA : scoreB;
  const opponentScore = side === "teamA" ? scoreB : scoreA;
  const invalid = validateScores(ownScore, opponentScore);
  if (invalid) return { ok: false, error: invalid };

  return {
    ok: true,
    patch: {
      status: "awaiting_confirmation",
      submittedBy: side,
      submittedScoreA: scoreA,
      submittedScoreB: scoreB,
      updatedAt: now,
    },
  };
}

function requireOwnPendingSubmission(match: Match, side: MatchSide): ScoreFlowError | null {
  if (match.status !== "awaiting_confirmation" || match.submittedBy !== side) {
    return {
      code: "wrong_state",
      message: "상대팀이 이미 확인했거나 처리된 경기라 수정·취소할 수 없습니다.",
    };
  }
  return null;
}

/**
 * The submitting team changes its own submitted score while the opponent
 * hasn't confirmed yet. Stays "awaiting_confirmation".
 */
export function editSubmission(
  match: Match,
  side: MatchSide,
  scoreA: number,
  scoreB: number,
  now: number
): ScoreFlowResult {
  const wrongState = requireOwnPendingSubmission(match, side);
  if (wrongState) return { ok: false, error: wrongState };

  const ownScore = side === "teamA" ? scoreA : scoreB;
  const opponentScore = side === "teamA" ? scoreB : scoreA;
  const invalid = validateScores(ownScore, opponentScore);
  if (invalid) return { ok: false, error: invalid };

  return {
    ok: true,
    patch: { submittedScoreA: scoreA, submittedScoreB: scoreB, updatedAt: now },
  };
}

/** The submitting team withdraws its submission; the match returns to "pending". */
export function cancelSubmission(match: Match, side: MatchSide, now: number): ScoreFlowResult {
  const wrongState = requireOwnPendingSubmission(match, side);
  if (wrongState) return { ok: false, error: wrongState };

  return {
    ok: true,
    patch: {
      status: "pending",
      submittedBy: null,
      submittedScoreA: null,
      submittedScoreB: null,
      updatedAt: now,
    },
  };
}

/**
 * Opposing team confirms (or disputes) a submitted score. Only the side
 * that did NOT submit may confirm. Matching scores finalize the match;
 * mismatched scores flip it to "disputed" for admin resolution.
 */
export function confirmScore(
  match: Match,
  side: MatchSide,
  scoreA: number,
  scoreB: number,
  now: number
): ScoreFlowResult {
  if (match.status !== "awaiting_confirmation") {
    return {
      ok: false,
      error: {
        code: "wrong_state",
        message: "확인 대기 중인 경기가 아닙니다.",
      },
    };
  }

  if (match.submittedBy === side) {
    return {
      ok: false,
      error: {
        code: "own_submission",
        message: "본인 팀이 제출한 점수입니다. 상대팀의 확인을 기다려주세요.",
      },
    };
  }

  if (match.submittedBy !== otherSide(side)) {
    return {
      ok: false,
      error: {
        code: "wrong_state",
        message: "이 경기의 참가팀이 아닙니다.",
      },
    };
  }

  const ownScore = side === "teamA" ? scoreA : scoreB;
  const opponentScore = side === "teamA" ? scoreB : scoreA;
  const invalid = validateScores(ownScore, opponentScore);
  if (invalid) return { ok: false, error: invalid };

  const matchesSubmission =
    scoreA === match.submittedScoreA && scoreB === match.submittedScoreB;

  if (matchesSubmission) {
    return {
      ok: true,
      patch: {
        status: "confirmed",
        scoreA,
        scoreB,
        resolvedBy: "confirmation",
        updatedAt: now,
      },
    };
  }

  return {
    ok: true,
    patch: {
      status: "disputed",
      opponentScoreA: scoreA,
      opponentScoreB: scoreB,
      updatedAt: now,
    },
  };
}

/**
 * Admin sets the final authoritative score for a disputed match.
 */
export function resolveDispute(
  match: Match,
  finalScoreA: number,
  finalScoreB: number,
  now: number
): ScoreFlowResult {
  if (match.status !== "disputed") {
    return {
      ok: false,
      error: {
        code: "wrong_state",
        message: "분쟁 상태의 경기가 아닙니다.",
      },
    };
  }

  const invalid = validateScores(finalScoreA, finalScoreB);
  if (invalid) return { ok: false, error: invalid };

  return {
    ok: true,
    patch: {
      status: "confirmed",
      scoreA: finalScoreA,
      scoreB: finalScoreB,
      resolvedBy: "admin",
      updatedAt: now,
    },
  };
}

/**
 * Admin force-sets a final score regardless of the match's current state
 * (pending, awaiting_confirmation, disputed, even already confirmed) — for
 * no-show/forfeit group-stage matches that would otherwise block knockout
 * bracket generation. Deliberately separate from `resolveDispute`, which
 * stays restricted to the "disputed" precondition as a safety rail; this
 * function is exposed through its own, distinctly-labeled admin control.
 */
export function overrideScore(
  match: Match,
  finalScoreA: number,
  finalScoreB: number,
  now: number
): ScoreFlowResult {
  if (match.isBye || match.teamAId === null || match.teamBId === null) {
    return {
      ok: false,
      error: {
        code: "opponent_tbd",
        message: "상대팀이 아직 결정되지 않았습니다.",
      },
    };
  }

  const invalid = validateScores(finalScoreA, finalScoreB);
  if (invalid) return { ok: false, error: invalid };

  return {
    ok: true,
    patch: {
      status: "confirmed",
      scoreA: finalScoreA,
      scoreB: finalScoreB,
      resolvedBy: "admin",
      updatedAt: now,
    },
  };
}
