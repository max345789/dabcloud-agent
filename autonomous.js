import { readFileSync, appendFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import OpenAI from "openai";
import { loadConfig, platformHasCredentials } from "./config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const config = loadConfig();

if (!existsSync(join(__dirname, "logs"))) mkdirSync(join(__dirname, "logs"));
if (!existsSync(join(__dirname, "posted"))) mkdirSync(join(__dirname, "posted"));

const LOG = join(__dirname, "logs", `agent-${new Date().toISOString().split("T")[0]}.log`);
const POSTED_TOPICS = join(__dirname, "posted", "topics-used.txt");

function log(level, msg) {
  const line = `[${new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })}] [${level}] ${msg}`;
  console.log(line);
  appendFileSync(LOG, line + "\n");
}

function getPostedTopics() {
  if (!existsSync(POSTED_TOPICS)) return [];
  return readFileSync(POSTED_TOPICS, "utf-8").split("\n").filter(Boolean);
}

function savePostedTopic(topic) {
  appendFileSync(POSTED_TOPICS, topic + "\n");
}

async function findTrendingTopic() {
  const client = new OpenAI({ apiKey: config.openai_api_key });
  const usedTopics = getPostedTopics();
  const avoidList = usedTopics.slice(-20).join(", ") || "none yet";
  const res = await client.chat.completions.create({
    model: "gpt-4o", max_tokens: 300,
    messages: [{ role: "user", content: `You are a content strategist for DabCloud (dabcloud.in) — an AI content repurposing agency with ContentForge AI tool. Find ONE trending topic to post on LinkedIn today about AI content marketing, content repurposing, social media growth, or ContentForge AI benefits. Topics already used (avoid): ${avoidList}. Respond ONLY with JSON: {"topic": "title", "angle": "specific hook", "key_points": ["point1", "point2", "point3"]}` }]
  });
  return JSON.parse(res.choices[0].message.content.trim().replace(/```json|```/g, ""));
}

async function generateLinkedInPost(topic) {
  const client = new OpenAI({ apiKey: config.openai_api_key });
  const res = await client.chat.completions.create({
    model: "gpt-4o", max_tokens: 1024,
    messages: [{ role: "user", content: `You are a LinkedIn content expert for DabCloud (dabcloud.in) — AI content repurposing agency. Write a LinkedIn post about: Topic: ${topic.topic}, Angle: ${topic.angle}, Key points: ${topic.key_points.join(", ")}. Rules: bold 1-line hook, line breaks between points, 3-5 insights, mention ContentForge AI naturally, end with a question, 3-5 hashtags, max 1500 chars, sound human. Output ONLY the post.` }]
  });
  return res.choices[0].message.content.trim();
}

async function postToLinkedIn(text) {
  const { access_token, person_urn } = config.platforms.linkedin;
  const res = await fetch("https://api.linkedin.com/v2/ugcPosts", {
    method: "POST",
    headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json", "X-Restli-Protocol-Version": "2.0.0" },
    body: JSON.stringify({ author: `urn:li:person:${person_urn}`, lifecycleState: "PUBLISHED", specificContent: { "com.linkedin.ugc.ShareContent": { shareCommentary: { text }, shareMediaCategory: "NONE" } }, visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" } })
  });
  if (!res.ok) throw new Error(`LinkedIn post failed: ${res.status} — ${await res.text()}`);
  return await res.json();
}

function isPostTime() {
  if (process.argv.includes("--force")) return true;
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const h = now.getHours(), m = now.getMinutes();
  return (config.post_times || ["08:00", "12:00", "18:00"]).some(t => {
    const [ph, pm] = t.split(":").map(Number);
    return h === ph && m <= 3;
  });
}

async function run() {
  log("INFO ", "DabCloud Autonomous Agent started");
  if (!isPostTime()) { log("INFO ", `Not post time. Scheduled: ${(config.post_times || ["08:00","12:00","18:00"]).join(", ")} IST`); return; }
  try {
    if (!config.openai_api_key) {
      log("ERROR", "Missing OpenAI API key. Set OPENAI_API_KEY or config/settings.json.");
      return;
    }
    if (!config.platforms?.linkedin?.enabled || !platformHasCredentials("linkedin", config.platforms.linkedin)) {
      log("ERROR", "LinkedIn is not fully configured. Set LINKEDIN_ACCESS_TOKEN and LINKEDIN_PERSON_URN.");
      return;
    }
    log("INFO ", "Finding trending topic...");
    const topic = await findTrendingTopic();
    log("OK   ", `Topic: "${topic.topic}"`);
    log("INFO ", "Generating LinkedIn post...");
    const post = await generateLinkedInPost(topic);
    log("OK   ", `Generated (${post.length} chars)`);
    if (config.platforms?.linkedin?.enabled) {
      log("INFO ", "Posting to LinkedIn...");
      await postToLinkedIn(post);
      log("OK   ", "Posted to LinkedIn!");
      savePostedTopic(topic.topic);
      appendFileSync(join(__dirname, "posted", `${new Date().toISOString().split("T")[0]}.txt`), `\n${"=".repeat(50)}\n${new Date().toISOString()}\nTOPIC: ${topic.topic}\n\n${post}\n`);
    }
  } catch (err) { log("ERROR", err.message); }
}

run();
