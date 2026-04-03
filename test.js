import OpenAI from "openai";
import { loadConfig } from "./config.js";

const config = loadConfig();

console.log("Key found:", config.openai_api_key ? "YES — " + config.openai_api_key.substring(0, 12) + "..." : "NO KEY");
console.log("Testing OpenAI connection...\n");

if (!config.openai_api_key) {
  console.log("FAILED: Missing OpenAI API key. Set OPENAI_API_KEY or config/settings.json.");
  process.exit(1);
}

const client = new OpenAI({ apiKey: config.openai_api_key });

try {
  const res = await client.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 50,
    messages: [{ role: "user", content: "Say: DabCloud agent is working!" }],
  });
  console.log("SUCCESS:", res.choices[0].message.content);
} catch (err) {
  console.log("FAILED:", err.message);
}
