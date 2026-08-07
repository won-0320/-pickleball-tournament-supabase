export function normalizeTeamName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

export function teamKey(division: string, group: string, teamName: string): string {
  return `${division}::${group}::${normalizeTeamName(teamName)}`;
}
