/**
 * Converts between domain objects (camelCase, types/domain.ts) and table rows
 * (snake_case, supabase/schema.sql). "group" and "order" are SQL reserved
 * words, so they're stored as group_name / match_order.
 */

type Row = Record<string, unknown>;

const RENAMED_COLUMNS: Record<string, string> = {
  group: "group_name",
  order: "match_order",
};

const RENAMED_FIELDS: Record<string, string> = Object.fromEntries(
  Object.entries(RENAMED_COLUMNS).map(([field, column]) => [column, field])
);

function fieldToColumn(field: string): string {
  return RENAMED_COLUMNS[field] ?? field.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

function columnToField(column: string): string {
  return RENAMED_FIELDS[column] ?? column.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

/** Domain object or partial patch → row. Undefined fields are dropped. */
export function toRow(obj: object): Row {
  const row: Row = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) row[fieldToColumn(key)] = value;
  }
  return row;
}

/** Row → domain object. Null optional arrays become undefined (the domain type marks it optional). */
export function fromRow<T>(row: Row): T {
  const obj: Row = {};
  for (const [key, value] of Object.entries(row)) {
    if (key === "league_divisions" && value === null) continue;
    obj[columnToField(key)] = value;
  }
  return obj as T;
}

/** Column name for a domain field, for use in filters. */
export function col(field: string): string {
  return fieldToColumn(field);
}
