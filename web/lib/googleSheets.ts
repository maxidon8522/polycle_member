import { google } from "googleapis";
import { DateTime } from "luxon";
import type { GoogleConfig } from "./env";

const SHEETS_SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"];

export type SheetTask = {
  rowIndex: number;
  project: string | null;
  title: string | null;
  assignee: string | null;
  status: string | null;
  dueDate: DateTime | null;
  startDate: DateTime | null;
  endDate: DateTime | null;
  url: string | null;
  notes: string | null;
  raw: Record<string, string>;
};

type HeaderKey =
  | "project"
  | "title"
  | "assignee"
  | "status"
  | "dueDate"
  | "startDate"
  | "endDate"
  | "url"
  | "notes";

const HEADER_ALIASES: Record<string, HeaderKey> = {
  project: "project",
  pj: "project",
  "pj名": "project",
  "プロジェクト": "project",
  "プロジェクト名": "project",
  title: "title",
  task: "title",
  "タスク": "title",
  "タスク名": "title",
  subject: "title",
  assignee: "assignee",
  owner: "assignee",
  担当: "assignee",
  担当者: "assignee",
  status: "status",
  ステータス: "status",
  状態: "status",
  due: "dueDate",
  deadline: "dueDate",
  期限: "dueDate",
  締切: "dueDate",
  締め切り: "dueDate",
  due日: "dueDate",
  開始日: "startDate",
  start: "startDate",
  startdate: "startDate",
  end: "endDate",
  完了日: "endDate",
  終了日: "endDate",
  finish: "endDate",
  終了: "endDate",
  url: "url",
  link: "url",
  詳細url: "url",
  ノート: "notes",
  備考: "notes",
  notes: "notes",
  メモ: "notes",
  解説: "notes"
};

export async function fetchSheetTasks(config: GoogleConfig, timezone: string): Promise<SheetTask[]> {
  const auth = new google.auth.JWT({
    email: config.clientEmail,
    key: config.privateKey,
    scopes: SHEETS_SCOPES,
    subject: undefined
  });

  const sheets = google.sheets({ version: "v4", auth });
  const range = await resolveSheetRange(sheets, config.sheetId, config.sheetRange);
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: config.sheetId,
    range
  });

  const values = response.data.values;
  if (!values || values.length === 0) {
    return [];
  }

  const headers = values[0].map((header) => normalizeHeader(header));
  const headerMapping: (HeaderKey | null)[] = headers.map((header) => (header ? HEADER_ALIASES[header] ?? null : null));

  const now = DateTime.now().setZone(timezone);
  const tasks: SheetTask[] = [];

  for (let rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
    const row = values[rowIndex] || [];
    const rawRecord: Record<string, string> = {};
    const task: { [K in HeaderKey]?: string } = {};

    row.forEach((cell, columnIndex) => {
      const rawHeader = values[0][columnIndex] || `Column${columnIndex}`;
      rawRecord[rawHeader] = typeof cell === "string" ? cell.trim() : String(cell ?? "");

      const mappedHeader = headerMapping[columnIndex];
      if (!mappedHeader) {
        return;
      }

      task[mappedHeader] = typeof cell === "string" ? cell.trim() : String(cell ?? "");
    });

    tasks.push({
      rowIndex: rowIndex + 1,
      project: task.project || null,
      title: task.title || null,
      assignee: task.assignee || null,
      status: task.status || null,
      dueDate: parseSheetDate(task.dueDate, timezone, now),
      startDate: parseSheetDate(task.startDate, timezone, now),
      endDate: parseSheetDate(task.endDate, timezone, now),
      url: task.url || null,
      notes: task.notes || null,
      raw: rawRecord
    });
  }

  return tasks;
}

async function resolveSheetRange(sheets: ReturnType<typeof google.sheets>, sheetId: string, explicitRange?: string): Promise<string> {
  if (explicitRange) {
    return explicitRange;
  }

  const metadata = await sheets.spreadsheets.get({
    spreadsheetId: sheetId,
    fields: "sheets(properties(title))"
  });

  const firstSheetTitle = metadata.data.sheets?.[0]?.properties?.title || "Sheet1";
  return `'${firstSheetTitle}'!A:Z`;
}

function normalizeHeader(header: unknown): string {
  if (!header) {
    return "";
  }
  const value = String(header)
    .trim()
    .toLowerCase()
    .replace(/[＿\s\-ー]/g, "");
  return value;
}

function parseSheetDate(value: string | undefined, timezone: string, now: DateTime): DateTime | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const numericValue = Number(trimmed);
  if (!Number.isNaN(numericValue) && numericValue > 25000) {
    const excelEpoch = DateTime.fromObject({ year: 1899, month: 12, day: 30 }, { zone: timezone });
    return excelEpoch.plus({ days: numericValue });
  }

  const isoCandidate = DateTime.fromISO(trimmed, { zone: timezone });
  if (isoCandidate.isValid) {
    return isoCandidate;
  }

  const formats = [
    "yyyy/MM/dd",
    "yyyy-M-d",
    "yyyy.M.d",
    "M/d/yyyy",
    "M/d/yy",
    "M/d",
    "MM/dd"
  ];

  for (const format of formats) {
    const parsed = DateTime.fromFormat(trimmed, format, { zone: timezone });
    if (parsed.isValid) {
      if (format === "M/d" || format === "MM/dd") {
        return parsed.set({ year: now.year });
      }
      return parsed;
    }
  }

  return null;
}
