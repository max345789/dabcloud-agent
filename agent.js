/**
 * DabCloud Content Repurposing Agent
 * Runs in the background on your Mac.
 * Reads queue.csv -> generates content -> posts to platforms -> logs results.
 */

import { generateContent } from "./generator.js";
import { postToPlatform } from "./poster.js";
import { getPendingItems, markAsProcessing, markAsDone, markAsFailed, logToPosted } from "./queue.js";
import { log } from "./logger.js";
import { CONFIG_PATH, isDryRunEnabled, loadConfig, platformHasCredentials } from "./config.js";

function buildDryRunPreview(item, platform) {
  const snippet = item.content.replace(/\s+/g, " ").trim().slice(0, 220);
  return `[DRY RUN ${platform.toUpperCase()}]\n${item.title}\n\n${snippet}${snippet.length >= 220 ? "..." : ""}`;
}

function getConfiguredPlatforms(platformNames, config, dryRun) {
  return platformNames.filter((platform) => {
    if (dryRun) return true;

    const platformConfig = config.platforms?.[platform];
    if (!platformConfig?.enabled) {
      log.warn(`${platform} is disabled in settings. Skipping.`);
      return false;
    }

    if (!platformHasCredentials(platform, platformConfig)) {
      log.warn(`${platform} is enabled but missing credentials. Skipping.`);
      return false;
    }

    return true;
  });
}

function isPostTime(postTimes) {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
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

function getNextScheduledRun(postTimes) {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const candidates = postTimes.map((time) => {
    const [hours, minutes] = time.split(":").map(Number);
    const candidate = new Date(now);
    candidate.setHours(hours, minutes, 0, 0);
    if (candidate <= now) {
      candidate.setDate(candidate.getDate() + 1);
    }
    return candidate;
  });

  return candidates.sort((left, right) => left.getTime() - right.getTime())[0];
}

function formatIstDate(date) {
  return date.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "short",
  });
}

async function processItem(item, config, options = {}) {
  const { dryRun = false } = options;

  log.divider();
  log.info(`${dryRun ? "Previewing" : "Processing"}: "${item.title}"`);
  log.info(`Platforms: ${item.platforms}`);

  const platforms = item.platforms.split(",").map((p) => p.trim()).filter(Boolean);
  const configuredPlatforms = getConfiguredPlatforms(platforms, config, dryRun);
  const results = [];
  const errors = [];

  if (!dryRun) {
    markAsProcessing(item.id);
  }

  if (configuredPlatforms.length === 0) {
    log.warn("No requested platforms are ready to run.");
    return;
  }

  for (const platform of configuredPlatforms) {
    const platformConfig = config.platforms?.[platform] || {};

    log.info(`${dryRun ? "[dry-run] " : ""}Generating ${platform} content...`);
    let generatedText;
    try {
      if (config.openai_api_key) {
        generatedText = await generateContent(
          item.content,
          platform,
          item.tone || config.default_tone,
          config.brand,
          config.openai_api_key
        );
      } else if (dryRun) {
        generatedText = buildDryRunPreview(item, platform);
      } else {
        throw new Error("OpenAI API key missing");
      }
      log.success(`${platform} content generated (${generatedText.length} chars)`);
    } catch (err) {
      log.error(`Failed to generate for ${platform}: ${err.message}`);
      errors.push({ platform, stage: "generate", error: err.message });
      continue;
    }

    if (!dryRun) {
      await new Promise((r) => setTimeout(r, 1000));
    }

    if (dryRun) {
      const preview = generatedText.replace(/\n+/g, " ").slice(0, 120);
      log.info(`[dry-run] Skipping live post to ${platform}. Preview: ${preview}${preview.length >= 120 ? "..." : ""}`);
      results.push({ platform, dry_run: true, preview: generatedText });
      continue;
    }

    log.info(`Posting to ${platform}...`);
    try {
      const postResult = await postToPlatform(platform, generatedText, platformConfig);
      log.success(`Posted to ${platform}! ${postResult.url || ""}`);
      results.push({ platform, ...postResult, preview: generatedText.substring(0, 80) + "..." });
    } catch (err) {
      log.error(`Failed to post to ${platform}: ${err.message}`);
      errors.push({ platform, stage: "post", error: err.message });
    }

    await new Promise((r) => setTimeout(r, 2000));
  }

  if (dryRun) {
    log.info(`Dry run complete for "${item.title}". Queue was not modified.`);
    return;
  }

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

async function runAgent() {
  const config = loadConfig();
  const force = process.argv.includes("--force");
  const runOnce = force || process.argv.includes("--once") || isDryRunEnabled();
  const dryRun = isDryRunEnabled();

  log.info(`DabCloud Agent started — ${config.brand}`);
  log.info(`Scheduled post times: ${config.post_times.join(", ")} IST`);
  if (!config.__meta?.hasFileConfig) {
    log.info(`Config file not found at ${CONFIG_PATH}. Falling back to environment variables.`);
  }
  if (dryRun) {
    log.info("Dry-run mode enabled. Content is generated or simulated, but nothing will be posted.");
  }
  log.divider();

  async function tick() {
    log.info("Checking content queue...");
    const pending = getPendingItems();

    if (pending.length === 0) {
      log.info("No pending items in queue. Waiting for next check.");
      return;
    }

    log.info(`Found ${pending.length} pending item(s) in queue.`);

    if (!force && !isPostTime(config.post_times)) {
      log.info(`Not a scheduled post time. Next windows: ${config.post_times.join(", ")} IST`);
      log.info(`Use: node agent.js --force  to post immediately`);
      return;
    }

    const item = pending[0];
    const requestedPlatforms = item.platforms.split(",").map((platform) => platform.trim()).filter(Boolean);
    const readyPlatforms = getConfiguredPlatforms(requestedPlatforms, config, dryRun);

    if (!dryRun && !config.openai_api_key) {
      log.error(`Missing OpenAI API key. Set OPENAI_API_KEY or create ${CONFIG_PATH}.`);
      return;
    }

    if (readyPlatforms.length === 0) {
      log.warn("No enabled platforms with complete credentials are available for the next queue item.");
      return;
    }

    await processItem(item, config, { dryRun });

    if (pending.length > 1) {
      log.info(`${pending.length - 1} more items in queue. Will process at next scheduled time.`);
    }
  }

  await tick();

  if (runOnce) {
    return;
  }

  async function scheduleNextTick() {
    const nextRun = getNextScheduledRun(config.post_times);
    const delayMs = Math.max(1000, nextRun.getTime() - Date.now());
    log.info(`Next scheduled check: ${formatIstDate(nextRun)} IST`);

    setTimeout(async () => {
      await tick();
      await scheduleNextTick();
    }, delayMs);
  }

  await scheduleNextTick();
}

runAgent().catch((err) => {
  log.error(`Agent crashed: ${err.message}`);
  process.exit(1);
});
