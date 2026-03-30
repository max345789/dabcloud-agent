import { appendFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_DIR = join(__dirname, "logs");
const LOG_FILE = join(LOG_DIR, `agent-${new Date().toISOString().split("T")[0]}.log`);

if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });

function timestamp() {
  return new Date().toLocaleTimeString("en-IN", {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}

function write(level, msg) {
  const line = `[${timestamp()}] [${level}] ${msg}`;
  console.log(line);
  appendFileSync(LOG_FILE, line + "\n");
}

export const log = {
  info:    (msg) => write("INFO ", msg),
  success: (msg) => write("✓ OK ", msg),
  warn:    (msg) => write("WARN ", msg),
  error:   (msg) => write("ERROR", msg),
  divider: ()    => write("─────", "─".repeat(50)),
};
