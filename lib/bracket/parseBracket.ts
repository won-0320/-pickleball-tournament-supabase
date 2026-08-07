import * as XLSX from "xlsx";

export interface TeamDraft {
  key: string; // `${division}::${normalizedTeamName}`
  division: string;
  teamName: string;
  player1: string;
  player2: string;
}

export interface MatchDraft {
  rowNumber: number;
  division: string;
  round: string;
  order: number | null;
  court: string | null;
  teamAKey: string;
  teamBKey: string;
  teamAName: string;
  teamBName: string;
}

export interface ParseIssue {
  row: number;
  message: string;
}

export interface ParseBracketResult {
  teams: TeamDraft[];
  matches: MatchDraft[];
  errors: ParseIssue[];
  warnings: ParseIssue[];
}

const REQUIRED_HEADERS = [
  "수준",
  "라운드",
  "팀A명",
  "A선수1",
  "A선수2",
  "팀B명",
  "B선수1",
  "B선수2",
] as const;

type RawRow = Record<string, unknown>;

function cell(row: RawRow, key: string): string {
  const value = row[key];
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeTeamName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

function teamKey(division: string, teamName: string): string {
  return `${division}::${normalizeTeamName(teamName)}`;
}

/**
 * Parses an uploaded bracket workbook (xlsx/csv) into team and match
 * drafts. Pure function — does not touch Firestore. One row = one match;
 * teams are deduplicated within the sheet by (수준, 팀명).
 */
export function parseBracket(buffer: Buffer): ParseBracketResult {
  const errors: ParseIssue[] = [];
  const warnings: ParseIssue[] = [];
  const teamMap = new Map<string, TeamDraft>();
  const matches: MatchDraft[] = [];

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "buffer" });
  } catch {
    errors.push({ row: 0, message: "파일을 읽을 수 없습니다. 엑셀(.xlsx) 또는 CSV 파일인지 확인해주세요." });
    return { teams: [], matches: [], errors, warnings };
  }

  const sheetName = workbook.SheetNames[0];
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
  if (!sheet) {
    errors.push({ row: 0, message: "시트를 찾을 수 없습니다." });
    return { teams: [], matches: [], errors, warnings };
  }

  const rows = XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: "" });
  if (rows.length === 0) {
    errors.push({ row: 0, message: "데이터가 없습니다. 1행은 헤더, 2행부터 경기 데이터를 입력해주세요." });
    return { teams: [], matches: [], errors, warnings };
  }

  const headers = Object.keys(rows[0]!);
  const missingHeaders = REQUIRED_HEADERS.filter((h) => !headers.includes(h));
  if (missingHeaders.length > 0) {
    errors.push({
      row: 1,
      message: `필수 컬럼이 없습니다: ${missingHeaders.join(", ")}`,
    });
    return { teams: [], matches: [], errors, warnings };
  }

  rows.forEach((row, index) => {
    const rowNumber = index + 2; // header is row 1

    const division = cell(row, "수준");
    const round = cell(row, "라운드");
    const teamAName = cell(row, "팀A명");
    const aPlayer1 = cell(row, "A선수1");
    const aPlayer2 = cell(row, "A선수2");
    const teamBName = cell(row, "팀B명");
    const bPlayer1 = cell(row, "B선수1");
    const bPlayer2 = cell(row, "B선수2");
    const courtRaw = cell(row, "코트");
    const orderRaw = cell(row, "경기순서");

    const missingFields: string[] = [];
    if (!division) missingFields.push("수준");
    if (!round) missingFields.push("라운드");
    if (!teamAName) missingFields.push("팀A명");
    if (!aPlayer1) missingFields.push("A선수1");
    if (!aPlayer2) missingFields.push("A선수2");
    if (!teamBName) missingFields.push("팀B명");
    if (!bPlayer1) missingFields.push("B선수1");
    if (!bPlayer2) missingFields.push("B선수2");

    if (missingFields.length > 0) {
      errors.push({
        row: rowNumber,
        message: `필수 값이 비어있습니다: ${missingFields.join(", ")}`,
      });
      return;
    }

    const keyA = teamKey(division, teamAName);
    const keyB = teamKey(division, teamBName);

    if (keyA === keyB) {
      errors.push({
        row: rowNumber,
        message: `팀A와 팀B가 동일합니다 (${teamAName}).`,
      });
      return;
    }

    let order: number | null = null;
    if (orderRaw !== "") {
      const parsed = Number(orderRaw);
      if (Number.isFinite(parsed)) {
        order = parsed;
      } else {
        warnings.push({
          row: rowNumber,
          message: `경기순서 값을 숫자로 해석할 수 없어 무시합니다: "${orderRaw}"`,
        });
      }
    }

    upsertTeam(teamMap, warnings, rowNumber, keyA, division, teamAName, aPlayer1, aPlayer2);
    upsertTeam(teamMap, warnings, rowNumber, keyB, division, teamBName, bPlayer1, bPlayer2);

    matches.push({
      rowNumber,
      division,
      round,
      order,
      court: courtRaw || null,
      teamAKey: keyA,
      teamBKey: keyB,
      teamAName,
      teamBName,
    });
  });

  return { teams: Array.from(teamMap.values()), matches, errors, warnings };
}

function upsertTeam(
  teamMap: Map<string, TeamDraft>,
  warnings: ParseIssue[],
  rowNumber: number,
  key: string,
  division: string,
  teamName: string,
  player1: string,
  player2: string
) {
  const existing = teamMap.get(key);
  if (!existing) {
    teamMap.set(key, { key, division, teamName, player1, player2 });
    return;
  }

  const samePlayers =
    (existing.player1 === player1 && existing.player2 === player2) ||
    (existing.player1 === player2 && existing.player2 === player1);

  if (!samePlayers) {
    warnings.push({
      row: rowNumber,
      message: `"${teamName}" 팀의 선수 정보가 이전 행과 다릅니다 (기존: ${existing.player1}/${existing.player2}, 이번 행: ${player1}/${player2}). 오타 여부를 확인해주세요.`,
    });
  }
}
