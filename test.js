import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import OpenAI from "openai";

const __dirname = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(join(__dirname, "config/settings.json"), "utf-8"));

console.log("Key found:", config.openai_api_key ? "YES — " + config.openai_api_key.substring(0, 12) + "..." : "NO KEY");
console.log("Testing OpenAI connection...\n");

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
