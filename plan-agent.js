/**
 * DabCloud Plan Agent
 * Posts to LinkedIn and Instagram according to the 90-day content plan.
 * Calculates today's plan day from PLAN_START_DATE, looks up the scheduled
 * entry, generates content + DALL-E 3 image with GPT-4o, and publishes it.
 */

import { readFileSync, appendFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import OpenAI from "openai";
import { loadConfig, platformHasCredentials } from "./config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const config = loadConfig();

function getClient() {
  return new OpenAI({ apiKey: config.openai_api_key });
}

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
  const client = getClient();
  const res = await client.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 1024,
    messages: [{
      role: "user",
      content: `You are a LinkedIn content expert writing for Krud AI (krud.ai) — an AI CLI agent for developers.

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

Output ONLY the post text.`
    }],
  });
  return res.choices[0].message.content.trim();
}

// ─── Generate Instagram caption ───────────────────────────────────────────────
async function generateInstagramCaption(entry) {
  const client = getClient();
  const res = await client.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 1024,
    messages: [{
      role: "user",
      content: `You are an Instagram content expert writing for Krud AI (krud.ai) — an AI CLI agent for developers.

Write an Instagram caption based on this planned content:
- Topic / Title: ${entry.title}
- Content Type: ${entry.content_type}
- CTA Goal: ${entry.cta}
- Week: ${entry.week} of the 90-day content plan

Rules:
- Start with a punchy hook (1–2 lines)
- Use emojis naturally, not excessively
- 3–5 short punchy points
- Mention Krud AI naturally
- End with a clear CTA or question
- Add 8–12 relevant hashtags at the very end
- Max 2000 characters
- Sound like a real founder/dev, not a brand account

Output ONLY the caption text.`
    }],
  });
  return res.choices[0].message.content.trim();
}

// ─── Generate Instagram image with DALL-E 3 ──────────────────────────────────
async function generateInstagramImage(entry, caption) {
  const client = getClient();
  // First, ask GPT-4o to write an optimised DALL-E prompt for this post
  const promptRes = await client.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 300,
    messages: [{
      role: "user",
      content: `Create a DALL-E 3 image prompt for an Instagram post about:
Topic: ${entry.title}
Content type: ${entry.content_type}
Brand: Krud AI — a dark-themed, minimal AI CLI tool for developers

Requirements:
- Square 1:1 composition
- Dark background (#0d0d0d or similar)
- Modern, clean tech aesthetic
- Bold typography area (leave space for text overlay if needed)
- No people, no stock-photo feel
- Should look native on a developer/tech Instagram feed
- Style: minimal, high-contrast, cinematic

Output ONLY the DALL-E prompt (no explanation).`
    }],
  });

  const imagePrompt = promptRes.choices[0].message.content.trim();
  log("INFO ", `Image prompt: ${imagePrompt.substring(0, 100)}...`);

  // Generate image with DALL-E 3
  const imageRes = await client.images.generate({
    model: "dall-e-3",
    prompt: imagePrompt,
    n: 1,
    size: "1024x1024",
    quality: "standard",
  });

  const imageUrl = imageRes.data[0].url;
  log("OK   ", `Image generated: ${imageUrl.substring(0, 60)}...`);
  return imageUrl;
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

// ─── Post to Instagram (image + caption) ─────────────────────────────────────
async function postToInstagram(imageUrl, caption) {
  const { access_token, user_id } = config.platforms.instagram;

  // Step 1: Create media container with DALL-E image URL
  const containerRes = await fetch(
    `https://graph.facebook.com/v25.0/${user_id}/media`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image_url: imageUrl,
        caption,
        access_token,
      }),
    }
  );

  const containerData = await containerRes.json();
  if (!containerRes.ok || !containerData.id) {
    throw new Error(`Instagram container failed: ${JSON.stringify(containerData)}`);
  }

  log("INFO ", `Instagram container created: ${containerData.id}`);

  // Step 2: Wait a moment for Instagram to process the image
  await new Promise((r) => setTimeout(r, 5000));

  // Step 3: Publish the container
  const publishRes = await fetch(
    `https://graph.facebook.com/v25.0/${user_id}/media_publish`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        creation_id: containerData.id,
        access_token,
      }),
    }
  );

  const publishData = await publishRes.json();
  if (!publishRes.ok) {
    throw new Error(`Instagram publish failed: ${JSON.stringify(publishData)}`);
  }

  return publishData;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function run() {
  log("INFO ", "DabCloud Plan Agent started");

  if (!config.openai_api_key) {
    log("ERROR", "Missing OpenAI API key. Set OPENAI_API_KEY or config/settings.json.");
    return;
  }

  const plan = loadPlan();
  const dayArg = process.argv.find(a => a.startsWith('--day='));
  const day = dayArg ? parseInt(dayArg.split('=')[1]) : getPlanDay();
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
      if (!platformHasCredentials("linkedin", config.platforms.linkedin)) {
        log("ERROR", "LinkedIn is enabled but missing credentials. Skipping.");
        continue;
      }
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
      if (!platformHasCredentials("instagram", config.platforms.instagram)) {
        log("ERROR", "Instagram is enabled but missing credentials. Skipping.");
        continue;
      }
      if (!process.argv.includes("--force") && isAlreadyPosted(day, "instagram")) {
        log("INFO ", `Day ${day} Instagram already posted. Skipping.`);
      } else {
        try {
          log("INFO ", "Generating Instagram caption...");
          const caption = await generateInstagramCaption(entry);
          log("OK   ", `Caption generated (${caption.length} chars)`);

          log("INFO ", "Generating Instagram image with DALL-E 3...");
          const imageUrl = await generateInstagramImage(entry, caption);

          log("INFO ", "Posting to Instagram...");
          await postToInstagram(imageUrl, caption);
          log("OK   ", "Posted to Instagram!");
          markPosted(day, entry.title, "instagram");

          appendFileSync(
            join(__dirname, "posted", `plan-day-${String(day).padStart(2, "0")}-instagram.txt`),
            `${"=".repeat(50)}\n${new Date().toISOString()}\nDAY: ${day} | ${entry.week}\nTOPIC: ${entry.title}\nTYPE: ${entry.content_type}\nCTA: ${entry.cta}\nIMAGE: ${imageUrl}\n\n${caption}\n`
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
