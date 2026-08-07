import type { MatchStatus } from "@/types/domain";

export const STATUS_LABELS: Record<MatchStatus, string> = {
  pending: "예정",
  awaiting_confirmation: "확인대기",
  confirmed: "확정",
  disputed: "분쟁",
};

export const STATUS_BADGE_CLASSES: Record<MatchStatus, string> = {
  pending: "bg-neutral-100 text-neutral-600",
  awaiting_confirmation: "bg-amber-100 text-amber-700",
  confirmed: "bg-emerald-100 text-emerald-700",
  disputed: "bg-red-100 text-red-700",
};
