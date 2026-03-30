import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const QUEUE_PATH = join(__dirname, "content/queue.csv");
const POSTED_PATH = join(__dirname, "posted/posted.csv");

function parseCSV(raw) {
  const lines = raw.trim().split("\n");
  const headers = lines[0].split(",").map((h) => h.replace(/"/g, "").trim());
  return lines.slice(1).map((line) => {
    // Handle quoted fields with commas inside
    const fields = [];
    let current = "";
    let inQuotes = false;
    for (const char of line) {
      if (char === '"') { inQuotes = !inQuotes; continue; }
      if (char === "," && !inQuotes) { fields.push(current.trim()); current = ""; continue; }
      current += char;
    }
    fields.push(current.trim());
    const obj = {};
    headers.forEach((h, i) => (obj[h] = fields[i] || ""));
    return obj;
  });
}

function toCSVLine(obj) {
  const fields = [
    obj.id,
    `"${obj.title}"`,
    `"${obj.content.replace(/"/g, "'")}"`,
    obj.tone,
    obj.platforms,
    obj.status,
    obj.created_at,
  ];
  return fields.join(",");
}

export function getPendingItems() {
  if (!existsSync(QUEUE_PATH)) return [];
  const raw = readFileSync(QUEUE_PATH, "utf-8");
  const rows = parseCSV(raw);
  return rows.filter((r) => r.status === "pending");
}

export function markAsProcessing(id) {
  updateStatus(id, "processing");
}

export function markAsDone(id) {
  updateStatus(id, "done");
}

export function markAsFailed(id, reason) {
  updateStatus(id, `failed: ${reason.substring(0, 80)}`);
}

function updateStatus(id, newStatus) {
  const raw = readFileSync(QUEUE_PATH, "utf-8");
  const lines = raw.split("\n");
  const updated = lines.map((line) => {
    if (line.startsWith(`${id},`) || line.startsWith(`${id},"`) ) {
      const parts = line.split(",");
      // status is index 5
      parts[5] = newStatus;
      return parts.join(",");
    }
    return line;
  });
  writeFileSync(QUEUE_PATH, updated.join("\n"));
}

export function logToPosted(item, results) {
  const header = "id,title,platforms,posted_at,results\n";
  const line = `${item.id},"${item.title}","${item.platforms}","${new Date().toISOString()}","${JSON.stringify(results).replace(/"/g, "'")}"\n`;
  
  if (!existsSync(POSTED_PATH)) {
    writeFileSync(POSTED_PATH, header + line);
  } else {
    const existing = readFileSync(POSTED_PATH, "utf-8");
    writeFileSync(POSTED_PATH, existing + line);
  }
}

export function addToQueue({ title, content, tone = "Professional", platforms = "linkedin,twitter" }) {
  const raw = existsSync(QUEUE_PATH) ? readFileSync(QUEUE_PATH, "utf-8") : "id,title,content,tone,platforms,status,created_at\n";
  const rows = parseCSV(raw);
  const newId = rows.length > 0 ? Math.max(...rows.map((r) => parseInt(r.id) || 0)) + 1 : 1;
  
  const newRow = {
    id: newId,
    title,
    content: content.replace(/\n/g, " "),
    tone,
    platforms,
    status: "pending",
    created_at: new Date().toISOString(),
  };

  const newLine = "\n" + toCSVLine(newRow);
  writeFileSync(QUEUE_PATH, raw + newLine);
  return newId;
}
