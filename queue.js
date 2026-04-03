import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const QUEUE_PATH = join(__dirname, "content/queue.csv");
const POSTED_PATH = join(__dirname, "posted/posted.csv");
const QUEUE_HEADERS = ["id", "title", "content", "tone", "platforms", "status", "created_at"];
const POSTED_HEADERS = ["id", "title", "platforms", "posted_at", "results"];

function escapeCsvValue(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function unescapeCsvValue(value) {
  const normalized = String(value ?? "").trim();
  if (normalized.startsWith('"') && normalized.endsWith('"')) {
    return normalized.slice(1, -1).replace(/""/g, '"');
  }
  return normalized;
}

function parseCsvLine(line) {
  const fields = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
        continue;
      }

      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      fields.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  fields.push(current);
  return fields;
}

function looksLikeValidQueueFields(fields) {
  if (fields.length !== QUEUE_HEADERS.length) return false;
  if (!/^\d+$/.test(String(fields[0] ?? "").trim())) return false;
  if (!/^\d{4}-\d{2}-\d{2}T/.test(String(fields[6] ?? "").trim())) return false;
  if ([fields[3], fields[4], fields[5], fields[6]].some((field) => String(field).includes('"'))) {
    return false;
  }
  return true;
}

function parseLegacyQueueLine(line) {
  const tailMatch = line.match(
    /^(.*),("([^"]*)"),("([^"]*)"),("([^"]*)"),("([^"]*)")$/
  );

  if (!tailMatch) {
    throw new Error("Unable to parse legacy queue row");
  }

  const [, prefix, tone, , platforms, , status, , createdAt] = tailMatch;
  const headMatch = prefix.match(/^([^,]+),("([^"]*)"),(.*)$/);

  if (!headMatch) {
    throw new Error("Unable to parse legacy queue row head");
  }

  const [, id, title, , rawContent] = headMatch;
  const content = unescapeCsvValue(rawContent);

  return [
    id,
    unescapeCsvValue(title),
    content,
    unescapeCsvValue(tone),
    unescapeCsvValue(platforms),
    unescapeCsvValue(status),
    unescapeCsvValue(createdAt),
  ];
}

function parseQueueRows(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  const lines = trimmed.split(/\r?\n/);
  const rows = [];

  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;

    let fields = parseCsvLine(line);
    if (!looksLikeValidQueueFields(fields)) {
      fields = parseLegacyQueueLine(line);
    }

    const row = {};
    QUEUE_HEADERS.forEach((header, index) => {
      row[header] = fields[index] ?? "";
    });
    rows.push(row);
  }

  return rows;
}

function serializeQueueRow(row) {
  return [
    row.id,
    escapeCsvValue(row.title),
    escapeCsvValue(row.content),
    escapeCsvValue(row.tone),
    escapeCsvValue(row.platforms),
    escapeCsvValue(row.status),
    escapeCsvValue(row.created_at),
  ].join(",");
}

function serializePostedRow(row) {
  return [
    row.id,
    escapeCsvValue(row.title),
    escapeCsvValue(row.platforms),
    escapeCsvValue(row.posted_at),
    escapeCsvValue(row.results),
  ].join(",");
}

function ensureQueueFile() {
  if (!existsSync(QUEUE_PATH)) {
    writeFileSync(QUEUE_PATH, `${QUEUE_HEADERS.join(",")}\n`);
  }
}

function readQueueRows() {
  ensureQueueFile();
  return parseQueueRows(readFileSync(QUEUE_PATH, "utf-8"));
}

function writeQueueRows(rows) {
  const output = [
    QUEUE_HEADERS.join(","),
    ...rows.map((row) => serializeQueueRow(row)),
  ].join("\n");
  writeFileSync(QUEUE_PATH, `${output}\n`);
}

function updateStatus(id, newStatus) {
  const rows = readQueueRows();
  const updatedRows = rows.map((row) => (
    String(row.id) === String(id)
      ? { ...row, status: newStatus }
      : row
  ));
  writeQueueRows(updatedRows);
}

export function getPendingItems() {
  return readQueueRows().filter((row) => row.status === "pending");
}

export function markAsProcessing(id) {
  updateStatus(id, "processing");
}

export function markAsDone(id) {
  updateStatus(id, "done");
}

export function markAsFailed(id, reason) {
  updateStatus(id, `failed: ${String(reason ?? "").trim().slice(0, 80)}`);
}

export function logToPosted(item, results) {
  const rows = existsSync(POSTED_PATH)
    ? readFileSync(POSTED_PATH, "utf-8").trim().split(/\r?\n/).filter(Boolean)
    : [];

  if (rows.length === 0) {
    rows.push(POSTED_HEADERS.join(","));
  }

  rows.push(
    serializePostedRow({
      id: item.id,
      title: item.title,
      platforms: item.platforms,
      posted_at: new Date().toISOString(),
      results: JSON.stringify(results),
    })
  );

  writeFileSync(POSTED_PATH, `${rows.join("\n")}\n`);
}

export function addToQueue({ title, content, tone = "Professional", platforms = "linkedin,twitter" }) {
  const rows = readQueueRows();
  const newId = rows.length > 0
    ? Math.max(...rows.map((row) => Number.parseInt(row.id, 10) || 0)) + 1
    : 1;

  rows.push({
    id: String(newId),
    title: title.trim(),
    content: String(content).replace(/\s*\n+\s*/g, " ").trim(),
    tone: tone.trim(),
    platforms: platforms.trim(),
    status: "pending",
    created_at: new Date().toISOString(),
  });

  writeQueueRows(rows);
  return newId;
}
