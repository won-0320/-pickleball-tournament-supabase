export function normalizeTeamName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

export function teamKey(division: string, group: string, teamName: string): string {
  return `${division}::${group}::${normalizeTeamName(teamName)}`;
}

/** 팀명 입력 없이, 두 선수 이름으로 표시용 팀명을 만든다 (예: "김철수·이영희"). */
export function deriveTeamName(player1: string, player2: string): string {
  return `${normalizeTeamName(player1)}·${normalizeTeamName(player2)}`;
}
