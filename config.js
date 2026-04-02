import { existsSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const CONFIG_PATH = join(__dirname, "config", "settings.json");
export const DEFAULT_POST_TIMES = ["08:00", "12:00", "18:00"];

function parseJsonFile(path) {
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf-8"));
}

function parseBoolean(value) {
  if (value === undefined) return undefined;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return undefined;
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parsePostTimes(value, fallback = DEFAULT_POST_TIMES) {
  if (!value) return fallback;
  const times = String(value)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return times.length > 0 ? times : fallback;
}

function mergePlatformConfig(fileConfig = {}, envConfig = {}, fallbackEnabled = false) {
  const merged = { ...fileConfig, ...envConfig };
  const explicitEnabled = parseBoolean(envConfig.enabled);

  if (typeof explicitEnabled === "boolean") {
    merged.enabled = explicitEnabled;
    return merged;
  }

  if (typeof fileConfig.enabled === "boolean") {
    merged.enabled = fileConfig.enabled;
    return merged;
  }

  merged.enabled = fallbackEnabled;
  return merged;
}

export function loadConfig() {
  const fileConfig = parseJsonFile(CONFIG_PATH);
  const filePlatforms = fileConfig.platforms || {};

  const linkedinEnv = {
    enabled: process.env.LINKEDIN_ENABLED,
    access_token: process.env.LINKEDIN_ACCESS_TOKEN,
    person_urn: process.env.LINKEDIN_PERSON_URN,
  };
  const twitterEnv = {
    enabled: process.env.TWITTER_ENABLED,
    api_key: process.env.TWITTER_API_KEY,
    api_secret: process.env.TWITTER_API_SECRET,
    access_token: process.env.TWITTER_ACCESS_TOKEN,
    access_token_secret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
  };
  const facebookEnv = {
    enabled: process.env.FACEBOOK_ENABLED,
    page_access_token: process.env.FACEBOOK_PAGE_ACCESS_TOKEN,
    page_id: process.env.FACEBOOK_PAGE_ID,
  };
  const instagramEnv = {
    enabled: process.env.INSTAGRAM_ENABLED,
    access_token: process.env.INSTAGRAM_ACCESS_TOKEN,
    ig_user_id: process.env.INSTAGRAM_IG_USER_ID || process.env.INSTAGRAM_USER_ID,
    user_id: process.env.INSTAGRAM_USER_ID || process.env.INSTAGRAM_IG_USER_ID,
  };

  const config = {
    brand: process.env.BRAND || fileConfig.brand || "DabCloud",
    default_tone: process.env.DEFAULT_TONE || fileConfig.default_tone || "Professional",
    check_interval_minutes: parsePositiveInteger(
      process.env.CHECK_INTERVAL_MINUTES,
      parsePositiveInteger(fileConfig.check_interval_minutes, 60)
    ),
    post_times: parsePostTimes(process.env.POST_TIMES, fileConfig.post_times || DEFAULT_POST_TIMES),
    plan_start_date: process.env.PLAN_START_DATE || fileConfig.plan_start_date || "",
    openai_api_key: process.env.OPENAI_API_KEY || fileConfig.openai_api_key || "",
    platforms: {
      linkedin: mergePlatformConfig(filePlatforms.linkedin, linkedinEnv, Boolean(linkedinEnv.access_token && linkedinEnv.person_urn)),
      twitter: mergePlatformConfig(
        filePlatforms.twitter,
        twitterEnv,
        Boolean(
          twitterEnv.api_key &&
            twitterEnv.api_secret &&
            twitterEnv.access_token &&
            twitterEnv.access_token_secret
        )
      ),
      facebook: mergePlatformConfig(
        filePlatforms.facebook,
        facebookEnv,
        Boolean(facebookEnv.page_access_token && facebookEnv.page_id)
      ),
      instagram: mergePlatformConfig(
        filePlatforms.instagram,
        instagramEnv,
        Boolean(instagramEnv.access_token && (instagramEnv.ig_user_id || instagramEnv.user_id))
      ),
    },
    __meta: {
      hasFileConfig: existsSync(CONFIG_PATH),
      configPath: CONFIG_PATH,
    },
  };

  return config;
}

export function isDryRunEnabled(argv = process.argv, env = process.env) {
  return argv.includes("--dry-run") || parseBoolean(env.DRY_RUN) === true;
}

export function platformHasCredentials(platform, config = {}) {
  switch (platform) {
    case "linkedin":
      return Boolean(config.access_token && config.person_urn);
    case "twitter":
      return Boolean(
        config.api_key &&
          config.api_secret &&
          config.access_token &&
          config.access_token_secret
      );
    case "facebook":
      return Boolean(config.page_access_token && config.page_id);
    case "instagram":
      return Boolean(config.access_token && (config.ig_user_id || config.user_id));
    default:
      return false;
  }
}
