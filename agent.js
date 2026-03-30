/**
 * DabCloud Content Repurposing Agent
 * Runs in the background on your Mac.
 * Reads queue.csv → generates content via Claude → posts to platforms → logs results.
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

import { generateContent } from "./generator.js";
import { postToPlatform } from "./poster.js";
import { getPendingItems, markAsProcessing, markAsDone, markAsFailed, logToPosted } from "./queue.js";
import { log } from "./logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, "config/settings.json");

// ─── Load config ─────────────────────────────────────────────────────────────
function loadConfig() {
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
  } catch (e) {
    log.error(`Cannot read config: ${e.message}`);
    process.exit(1);
  }
}

// ─── Check if it's a scheduled post time ─────────────────────────────────────
function isPostTime(postTimes) {
  const now = new Date();
  const currentTime = now.toLocaleTimeString("en-IN", {
    hour: "2-digit", minute: "2-digit", hour12: false,
    timeZone: "Asia/Kolkata",
  });
  return postTimes.some((t) => {
    const [h, m] = t.split(":").map(Number);
    const [ch, cm] = currentTime.split(":").map(Number);
    return ch === h && Math.abs(cm - m) <= 2; // 2-minute window
  });
}

// ─── Process one queue item ───────────────────────────────────────────────────
async function processItem(item, config) {
  log.divider();
  log.info(`Processing: "${item.title}"`);
  log.info(`Platforms: ${item.platforms}`);

  markAsProcessing(item.id);

  const platforms = item.platforms.split(",").map((p) => p.trim());
  const results = [];
  const errors = [];

  for (const platform of platforms) {
    const platformConfig = config.platforms[platform];

    if (!platformConfig?.enabled) {
      log.warn(`${platform} is disabled in settings. Skipping.`);
      continue;
    }

    // Step 1: Generate content
    log.info(`Generating ${platform} content...`);
    let generatedText;
    try {
      generatedText = await generateContent(
        item.content,
        platform,
        item.tone || config.default_tone,
        config.brand,
        config.openai_api_key
      );
      log.success(`${platform} content generated (${generatedText.length} chars)`);
    } catch (err) {
      log.error(`Failed to generate for ${platform}: ${err.message}`);
      errors.push({ platform, stage: "generate", error: err.message });
      continue;
    }

    // Brief pause between API calls
    await new Promise((r) => setTimeout(r, 1000));

    // Step 2: Post to platform
    log.info(`Posting to ${platform}...`);
    try {
      const postResult = await postToPlatform(platform, generatedText, platformConfig);
      log.success(`Posted to ${platform}! ${postResult.url || ""}`);
      results.push({ platform, ...postResult, preview: generatedText.substring(0, 80) + "..." });
    } catch (err) {
      log.error(`Failed to post to ${platform}: ${err.message}`);
      errors.push({ platform, stage: "post", error: err.message });
    }

    // Pause between platforms to be respectful of rate limits
    await new Promise((r) => setTimeout(r, 2000));
  }

  // Mark queue item status
  if (errors.length === 0) {
    markAsDone(item.id);
    logToPosted(item, results);
    log.success(`"${item.title}" fully posted to all platforms.`);
  } else if (results.length > 0) {
    markAsDone(item.id);
    logToPosted(item, results);
    log.warn(`"${item.title}" posted with some errors. Check logs.`);
  } else {
    markAsFailed(item.id, errors[0]?.error || "All platforms failed");
    log.error(`"${item.title}" failed completely. Will retry next run.`);
  }
}

// ─── Main agent loop ──────────────────────────────────────────────────────────
async function runAgent() {
  const config = loadConfig();
  const intervalMs = (config.check_interval_minutes || 60) * 60 * 1000;

  log.info(`DabCloud Agent started — ${config.brand}`);
  log.info(`Checking queue every ${config.check_interval_minutes} minutes`);
  log.info(`Scheduled post times: ${config.post_times.join(", ")} IST`);
  log.divider();

  async function tick() {
    log.info("Checking content queue...");
    const pending = getPendingItems();

    if (pending.length === 0) {
      log.info("No pending items in queue. Waiting for next check.");
      return;
    }

    log.info(`Found ${pending.length} pending item(s) in queue.`);

    // Check if we're in a scheduled post window (or in --force mode)
    const force = process.argv.includes("--force");
    if (!force && !isPostTime(config.post_times)) {
      log.info(`Not a scheduled post time. Next windows: ${config.post_times.join(", ")} IST`);
      log.info(`Use: node agent.js --force  to post immediately`);
      return;
    }

    // Process one item per tick (to avoid rate limits)
    const item = pending[0];
    await processItem(item, config);

    if (pending.length > 1) {
      log.info(`${pending.length - 1} more items in queue. Will process at next scheduled time.`);
    }
  }

  // Run immediately on start
  await tick();

  // Then run on interval
  setInterval(async () => {
    await tick();
  }, intervalMs);
}

// ─── Start ────────────────────────────────────────────────────────────────────
runAgent().catch((err) => {
  log.error(`Agent crashed: ${err.message}`);
  process.exit(1);
});
