/**
 * DabCloud Plan Agent
 * Posts to LinkedIn and Instagram according to the 90-day content plan.
 * Calculates today's plan day from PLAN_START_DATE, looks up the scheduled
 * entry, generates the full post with GPT-4o, and publishes it.
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
        instagram: {
          enabled: process.env.INSTAGRAM_ENABLED !== "false",
          access_token: process.env.INSTAGRAM_ACCESS_TOKEN,
          user_id: process.env.INSTAGRAM_USER_ID,
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

function getTodayEntries(plan, day) {
  return plan.filter((entry) => parseInt(entry.day) === day);
}

function isAlreadyPosted(day, platform) {
  if (!existsSync(POSTED_LOG)) return false;
  return readFileSync(POSTED_LOG, "utf-8")
    .split("\n")
    .some((l) => l.startsWith(`DAY:${day}|`) && l.includes(`|PLATFORM:${platform}|`));
}

function markPosted(day, title, platform) {
  appendFileSync(POSTED_LOG, `DAY:${day}|DATE:${new Date().toISOString()}|PLATFORM:${platform}|TITLE:${title}\n`);
}

// ─── Generate LinkedIn post ───────────────────────────────────────────────────
async function generateLinkedInPost(entry) {
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

// ─── Generate Instagram caption ───────────────────────────────────────────────
async function generateInstagramCaption(entry) {
  const prompt = `You are an Instagram content expert writing for Krud AI (krud.ai) — an AI CLI agent for developers.

Write an Instagram caption based on this planned content:
- Topic / Title: ${entry.title}
- Content Type: ${entry.content_type}
- CTA Goal: ${entry.cta}
- Week: ${entry.week} of the 90-day content plan

Rules:
- Start with a punchy hook (1 line, no hashtags yet)
- Short sentences, emoji-friendly but not overdone
- 2–4 key points
- Mention Krud AI naturally
- End with a question or clear CTA
- Add 5–10 relevant hashtags at the very end
- Max 2000 characters
- Sound genuine, not corporate

Output ONLY the caption text.`;

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

// ─── Post to Instagram ────────────────────────────────────────────────────────
async function postToInstagram(caption) {
  const { access_token, user_id } = config.platforms.instagram;

  // Step 1: Create media container (text-only carousel/feed post)
  const containerRes = await fetch(
    `https://graph.facebook.com/v25.0/${user_id}/media`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        caption,
        media_type: "REELS",
        // For a caption-only post we use a placeholder — Instagram requires media.
        // We'll use image_url with a plain white image for text posts.
        // If you want to skip media, use the threads API instead.
        access_token,
      }),
    }
  );

  if (!containerRes.ok) {
    const errText = await containerRes.text();
    throw new Error(`Instagram container creation failed: ${containerRes.status} — ${errText}`);
  }

  const container = await containerRes.json();

  if (!container.id) {
    throw new Error(`Instagram container has no ID: ${JSON.stringify(container)}`);
  }

  // Step 2: Publish the container
  const publishRes = await fetch(
    `https://graph.facebook.com/v25.0/${user_id}/media_publish`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        creation_id: container.id,
        access_token,
      }),
    }
  );

  if (!publishRes.ok) {
    throw new Error(`Instagram publish failed: ${publishRes.status} — ${await publishRes.text()}`);
  }

  return await publishRes.json();
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function run() {
  log("INFO ", "DabCloud Plan Agent started");

  const plan = loadPlan();
  const day = getPlanDay();
  log("INFO ", `Today is Plan Day ${day} of 90`);

  const entries = getTodayEntries(plan, day);
  if (entries.length === 0) {
    log("INFO ", `No posts scheduled for Day ${day}. Nothing to do.`);
    return;
  }

  for (const entry of entries) {
    const platform = entry.platform;
    log("INFO ", `Scheduled: [${entry.content_type}] ${entry.title} → ${platform}`);

    // ── LinkedIn ──────────────────────────────────────────────────────────
    if (platform.includes("LinkedIn") && config.platforms?.linkedin?.enabled) {
      if (!process.argv.includes("--force") && isAlreadyPosted(day, "linkedin")) {
        log("INFO ", `Day ${day} LinkedIn already posted. Skipping.`);
      } else {
        log("INFO ", "Generating LinkedIn post...");
        const post = await generateLinkedInPost(entry);
        log("OK   ", `Generated (${post.length} chars)`);

        log("INFO ", "Posting to LinkedIn...");
        await postToLinkedIn(post);
        log("OK   ", "Posted to LinkedIn!");
        markPosted(day, entry.title, "linkedin");

        appendFileSync(
          join(__dirname, "posted", `plan-day-${String(day).padStart(2, "0")}-linkedin.txt`),
          `${"=".repeat(50)}\n${new Date().toISOString()}\nDAY: ${day} | ${entry.week}\nTOPIC: ${entry.title}\nTYPE: ${entry.content_type}\nCTA: ${entry.cta}\n\n${post}\n`
        );
      }
    }

    // ── Instagram ─────────────────────────────────────────────────────────
    if (platform.includes("Instagram") && config.platforms?.instagram?.enabled) {
      if (!process.argv.includes("--force") && isAlreadyPosted(day, "instagram")) {
        log("INFO ", `Day ${day} Instagram already posted. Skipping.`);
      } else {
        log("INFO ", "Generating Instagram caption...");
        const caption = await generateInstagramCaption(entry);
        log("OK   ", `Generated (${caption.length} chars)`);

        log("INFO ", "Posting to Instagram...");
        try {
          await postToInstagram(caption);
          log("OK   ", "Posted to Instagram!");
          markPosted(day, entry.title, "instagram");

          appendFileSync(
            join(__dirname, "posted", `plan-day-${String(day).padStart(2, "0")}-instagram.txt`),
            `${"=".repeat(50)}\n${new Date().toISOString()}\nDAY: ${day} | ${entry.week}\nTOPIC: ${entry.title}\nTYPE: ${entry.content_type}\nCTA: ${entry.cta}\n\n${caption}\n`
          );
        } catch (igErr) {
          log("WARN ", `Instagram post failed (skipping): ${igErr.message}`);
        }
      }
    }
  }
}

run().catch((err) => {
  log("ERROR", err.message);
  process.exit(1);
});
