import type { SeededTeam } from "./seeding";

export const KNOCKOUT_ROUND_NAMES: Record<number, string> = {
  2: "결승",
  4: "준결승",
  8: "8강",
  16: "16강",
  32: "32강",
  64: "64강",
  128: "128강",
};

/** `teamsAtRoundStart` = how many teams begin the round (e.g. 8 -> "8강"). */
export function roundName(teamsAtRoundStart: number): string {
  return KNOCKOUT_ROUND_NAMES[teamsAtRoundStart] ?? `${teamsAtRoundStart}강`;
}

export interface KnockoutMatchDraft {
  roundIndex: number;
  slotIndex: number;
  roundName: string;
  teamAId: string | null;
  teamAName: string | null;
  teamASeed: number | null;
  teamBId: string | null;
  teamBName: string | null;
  teamBSeed: number | null;
  isBye: boolean;
}

export interface KnockoutBracketDraft {
  roundCount: number;
  matches: KnockoutMatchDraft[];
  warnings: string[];
}

function nextPowerOfTwo(n: number): number {
  let size = 1;
  while (size < n) size *= 2;
  return size;
}

/** Standard recursive seed placement order for a power-of-two bracket, e.g. size 8 -> [1,8,4,5,2,7,3,6]. */
function standardSeedOrder(size: number): number[] {
  let order = [1];
  while (order.length < size) {
    const len = order.length * 2;
    order = order.flatMap((seed) => [seed, len + 1 - seed]);
  }
  return order;
}

type Slot = SeededTeam | null;

/**
 * Best-effort fix for round-1 same-group collisions: for each colliding
 * pair, look for another pair where swapping one team resolves both pairs
 * without creating a new collision. Not guaranteed to resolve every input
 * (e.g. a single group dominating the advancing set) — unresolved
 * collisions are reported as warnings rather than blocking generation.
 */
function resolveGroupCollisions(pairs: [Slot, Slot][]): string[] {
  const warnings: string[] = [];

  for (let p = 0; p < pairs.length; p++) {
    const [a, b] = pairs[p]!;
    if (!a || !b || a.group !== b.group) continue;

    let fixed = false;
    for (let q = 0; q < pairs.length; q++) {
      if (q === p) continue;
      const [c, d] = pairs[q]!;

      if (c && a.group !== c.group && d && d.group !== b.group) {
        pairs[p]![1] = c;
        pairs[q]![0] = b;
        fixed = true;
        break;
      }
      if (d && a.group !== d.group && c && c.group !== b.group) {
        pairs[p]![1] = d;
        pairs[q]![1] = b;
        fixed = true;
        break;
      }
    }

    if (!fixed) {
      warnings.push(`1라운드에서 같은 조 팀끼리 대결이 배정되었습니다: ${a.teamName} vs ${b.teamName}`);
    }
  }

  return warnings;
}

/**
 * Builds a full knockout bracket draft (pure — no Firestore I/O) from a
 * seeded, ordered list of advancing teams. Round 1 gets real matchups
 * (with byes for top seeds if the seed count isn't a power of two); every
 * later round is a placeholder ("TBD vs TBD") except where a round-1 bye's
 * lone winner can be propagated in immediately.
 */
export function buildKnockoutBracket(
  seeds: SeededTeam[]
): KnockoutBracketDraft | { error: string } {
  const s = seeds.length;
  if (s < 2) {
    return { error: "토너먼트를 생성하려면 최소 2팀이 필요합니다." };
  }

  const bracketSize = nextPowerOfTwo(s);
  const order = standardSeedOrder(bracketSize);
  const bySeed = new Map(seeds.map((t) => [t.seed, t]));

  const slots: Slot[] = order.map((seedNum) => bySeed.get(seedNum) ?? null);

  const pairs: [Slot, Slot][] = [];
  for (let i = 0; i < slots.length; i += 2) {
    pairs.push([slots[i]!, slots[i + 1]!]);
  }

  const warnings = resolveGroupCollisions(pairs);

  const roundCount = Math.log2(bracketSize);
  const matches: KnockoutMatchDraft[] = [];

  // Round 0 (first round): real matchups + byes.
  const round0Name = roundName(bracketSize);
  pairs.forEach(([a, b], slotIndex) => {
    matches.push({
      roundIndex: 0,
      slotIndex,
      roundName: round0Name,
      teamAId: a?.teamId ?? null,
      teamAName: a?.teamName ?? null,
      teamASeed: a?.seed ?? null,
      teamBId: b?.teamId ?? null,
      teamBName: b?.teamName ?? null,
      teamBSeed: b?.seed ?? null,
      isBye: !a || !b,
    });
  });

  // Rounds 1..roundCount-1: placeholders, sized by halving each round.
  for (let r = 1; r < roundCount; r++) {
    const teamsAtStart = bracketSize / 2 ** r;
    const rName = roundName(teamsAtStart);
    const matchCount = teamsAtStart / 2;
    for (let slotIndex = 0; slotIndex < matchCount; slotIndex++) {
      matches.push({
        roundIndex: r,
        slotIndex,
        roundName: rName,
        teamAId: null,
        teamAName: null,
        teamASeed: null,
        teamBId: null,
        teamBName: null,
        teamBSeed: null,
        isBye: false,
      });
    }
  }

  // Propagate round-1 bye winners directly into their round-2 slot (pure,
  // deterministic — no async cascade needed since generation is one pass).
  if (roundCount > 1) {
    for (const match of matches.filter((m) => m.roundIndex === 0 && m.isBye)) {
      const winnerId = match.teamAId ?? match.teamBId;
      const winnerName = match.teamAName ?? match.teamBName;
      const winnerSeed = match.teamASeed ?? match.teamBSeed;
      if (!winnerId) continue; // shouldn't happen: a bye always has exactly one real team

      const nextSlotIndex = Math.floor(match.slotIndex / 2);
      const nextSlot = match.slotIndex % 2 === 0 ? "teamA" : "teamB";
      const nextMatch = matches.find((m) => m.roundIndex === 1 && m.slotIndex === nextSlotIndex);
      if (!nextMatch) continue;

      if (nextSlot === "teamA") {
        nextMatch.teamAId = winnerId;
        nextMatch.teamAName = winnerName;
        nextMatch.teamASeed = winnerSeed;
      } else {
        nextMatch.teamBId = winnerId;
        nextMatch.teamBName = winnerName;
        nextMatch.teamBSeed = winnerSeed;
      }
    }
  }

  return { roundCount, matches, warnings };
}
