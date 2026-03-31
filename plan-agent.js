/**
 * DabCloud Plan Agent
 * Posts to LinkedIn according to the 90-day content plan.
 * Calculates today's plan day from PLAN_START_DATE, looks up the scheduled
 * LinkedIn entry, generates the full post with GPT-4o, and publishes it.
 */

import { readFileSync, appendFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import OpenAI from "openai";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Config ──────────────────────────────────────────────────────────────────
const configPath = join(__dirname, "config/settings.json");
const config = existsSync(configPath)
  ? JSON.parse(readFileSync(configPath, "utf-8"))
  : {
      openai_api_key: process.env.OPENAI_API_KEY,
      platforms: {
        linkedin: {
          enabled: process.env.LINKEDIN_ENABLED !== "false",
          access_token: process.env.LINKEDIN_ACCESS_TOKEN,
          person_urn: process.env.LINKEDIN_PERSON_URN,
        },
      },
    };

const client = new OpenAI({ apiKey: config.openai_api_key });

// ─── Dirs ─────────────────────────────────────────────────────────────────────
if (!existsSync(join(__dirname, "logs"))) mkdirSync(join(__dirname, "logs"));
if (!existsSync(join(__dirname, "posted"))) mkdirSync(join(__dirname, "posted"));

const LOG = join(__dirname, "logs", `plan-agent-${new Date().toISOString().split("T")[0]}.log`);
const POSTED_LOG = join(__dirname, "posted", "plan-posted.txt");

// ─── Logger ──────────────────────────────────────────────────────────────────
function log(level, msg) {
  const line = `[${new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })}] [${level}] ${msg}`;
  console.log(line);
  appendFileSync(LOG, line + "\n");
}

// ─── Plan helpers ─────────────────────────────────────────────────────────────
function loadPlan() {
  const planPath = join(__dirname, "content/plan.json");
  if (!existsSync(planPath)) throw new Error("content/plan.json not found");
  return JSON.parse(readFileSync(planPath, "utf-8"));
}

function getPlanDay() {
  // PLAN_START_DATE env var sets day 1. Defaults to today (day 1).
  const startEnv = process.env.PLAN_START_DATE || config.plan_start_date;
  if (!startEnv) return 1;
  const start = new Date(startEnv);
  start.setHours(0, 0, 0, 0);
  const today = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  today.setHours(0, 0, 0, 0);
  const diffMs = today - start;
  const day = Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
  return day;
}

function getTodayEntry(plan, day) {
  return plan.find(
    (entry) => parseInt(entry.day) === day && entry.platform.includes("LinkedIn")
  );
}

function isAlreadyPosted(day) {
  if (!existsSync(POSTED_LOG)) return false;
  return readFileSync(POSTED_LOG, "utf-8").split("\n").some((l) => l.startsWith(`DAY:${day}|`));
}

function markPosted(day, title) {
  appendFileSync(POSTED_LOG, `DAY:${day}|DATE:${new Date().toISOString()}|TITLE:${title}\n`);
}

// ─── Generate post ────────────────────────────────────────────────────────────
async function generatePost(entry) {
  const prompt = `You are a LinkedIn content expert writing for Krud AI (krud.ai) — an AI CLI agent for developers.

Write a LinkedIn post based on this planned content:
- Topic / Title: ${entry.title}
- Content Type: ${entry.content_type}
- CTA Goal: ${entry.cta}
- Week: ${entry.week} of the 90-day content plan

Rules:
- Start with a bold, scroll-stopping hook (1 line)
- Use short paragraphs and line breaks between points
- 3–5 key insights or story beats
- Mention Krud AI naturally (don't force it)
- End with a question to drive comments
- Add 3–5 relevant hashtags at the end
- Max 1500 characters
- Sound like a real developer / founder, not a marketer

Output ONLY the post text.`;

  const res = await client.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });
  return res.choices[0].message.content.trim();
}

// ─── Post to LinkedIn ─────────────────────────────────────────────────────────
async function postToLinkedIn(text) {
  const { access_token, person_urn } = config.platforms.linkedin;
  const res = await fetch("https://api.linkedin.com/v2/ugcPosts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${access_token}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify({
      author: `urn:li:person:${person_urn}`,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text },
          shareMediaCategory: "NONE",
        },
      },
      visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
    }),
  });
  if (!res.ok) throw new Error(`LinkedIn post failed: ${res.status} — ${await res.text()}`);
  return await res.json();
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function run() {
  log("INFO ", "DabCloud Plan Agent started");

  const plan = loadPlan();
  const day = getPlanDay();
  log("INFO ", `Today is Plan Day ${day} of 90`);

  const entry = getTodayEntry(plan, day);
  if (!entry) {
    log("INFO ", `No LinkedIn post scheduled for Day ${day}. Nothing to do.`);
    return;
  }

  log("INFO ", `Scheduled: [${entry.content_type}] ${entry.title}`);

  if (!process.argv.includes("--force") && isAlreadyPosted(day)) {
    log("INFO ", `Day ${day} already posted. Skipping.`);
    return;
  }

  log("INFO ", "Generating post from plan...");
  const post = await generatePost(entry);
  log("OK   ", `Generated (${post.length} chars)`);

  if (config.platforms?.linkedin?.enabled) {
    log("INFO ", "Posting to LinkedIn...");
    await postToLinkedIn(post);
    log("OK   ", "Posted to LinkedIn!");
    markPosted(day, entry.title);

    appendFileSync(
      join(__dirname, "posted", `plan-day-${String(day).padStart(2, "0")}.txt`),
      `${"=".repeat(50)}\n${new Date().toISOString()}\nDAY: ${day} | ${entry.week}\nTOPIC: ${entry.title}\nTYPE: ${entry.content_type}\nCTA: ${entry.cta}\n\n${post}\n`
    );
  }
}

run().catch((err) => {
  log("ERROR", err.message);
  process.exit(1);
});
