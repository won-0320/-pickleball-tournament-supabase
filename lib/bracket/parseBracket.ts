import * as XLSX from "xlsx";
import { teamKey, deriveTeamName } from "./teamKey";

export interface RosterTeamDraft {
  key: string; // `${division}::${group}::${normalizedTeamName}`
  division: string;
  group: string;
  teamName: string;
  player1: string;
  player2: string;
}

export interface ParseIssue {
  row: number;
  message: string;
}

export interface ParseRosterResult {
  teams: RosterTeamDraft[];
  errors: ParseIssue[];
  warnings: ParseIssue[];
}

const REQUIRED_HEADERS = ["부문", "조", "선수1", "선수2"] as const;

type RawRow = Record<string, unknown>;

function cell(row: RawRow, key: string): string {
  const value = row[key];
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

/**
 * Parses an uploaded team roster (xlsx/csv) into team drafts. Pure function
 * — does not touch Firestore. One row = one team; the app auto-generates
 * every round-robin match within each (division, group) from this roster
 * (see lib/bracket/roundRobin.ts).
 */
export function parseBracket(buffer: Buffer): ParseRosterResult {
  const errors: ParseIssue[] = [];
  const warnings: ParseIssue[] = [];
  const teams: RosterTeamDraft[] = [];
  const seenKeys = new Set<string>();

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "buffer" });
  } catch {
    errors.push({ row: 0, message: "파일을 읽을 수 없습니다. 엑셀(.xlsx) 또는 CSV 파일인지 확인해주세요." });
    return { teams: [], errors, warnings };
  }

  const sheetName = workbook.SheetNames[0];
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
  if (!sheet) {
    errors.push({ row: 0, message: "시트를 찾을 수 없습니다." });
    return { teams: [], errors, warnings };
  }

  const rows = XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: "" });
  if (rows.length === 0) {
    errors.push({ row: 0, message: "데이터가 없습니다. 1행은 헤더, 2행부터 팀 정보를 입력해주세요." });
    return { teams: [], errors, warnings };
  }

  const headers = Object.keys(rows[0]!);
  const missingHeaders = REQUIRED_HEADERS.filter((h) => !headers.includes(h));
  if (missingHeaders.length > 0) {
    errors.push({
      row: 1,
      message: `필수 컬럼이 없습니다: ${missingHeaders.join(", ")}`,
    });
    return { teams: [], errors, warnings };
  }

  rows.forEach((row, index) => {
    const rowNumber = index + 2; // header is row 1

    const division = cell(row, "부문");
    const group = cell(row, "조");
    const player1 = cell(row, "선수1");
    const player2 = cell(row, "선수2");

    const missingFields: string[] = [];
    if (!division) missingFields.push("부문");
    if (!group) missingFields.push("조");
    if (!player1) missingFields.push("선수1");
    if (!player2) missingFields.push("선수2");

    if (missingFields.length > 0) {
      errors.push({
        row: rowNumber,
        message: `필수 값이 비어있습니다: ${missingFields.join(", ")}`,
      });
      return;
    }

    const teamName = deriveTeamName(player1, player2);
    const key = teamKey(division, group, teamName);
    if (seenKeys.has(key)) {
      errors.push({
        row: rowNumber,
        message: `"${player1}, ${player2}" 팀이 같은 조(${group}, 부문 ${division})에 중복 등록되어 있습니다.`,
      });
      return;
    }
    seenKeys.add(key);

    teams.push({ key, division, group, teamName, player1, player2 });
  });

  return { teams, errors, warnings };
}
