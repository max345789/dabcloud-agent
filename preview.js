import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import OpenAI from "openai";

const __dirname = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(join(__dirname, "config/settings.json"), "utf-8"));
const client = new OpenAI({ apiKey: config.openai_api_key });

const content = `Repurposing content is one of the smartest things a creator can do. Instead of writing from scratch every day, you take one well-researched piece and extract maximum value from it. Turn your blog post intro into a LinkedIn hook. Extract key facts for Twitter threads. Turn subheadings into Instagram carousels. One input, ten outputs.`;

console.log("=".repeat(60));
console.log("LINKEDIN POST");
console.log("=".repeat(60));

const li = await client.chat.completions.create({
  model: "gpt-4o", max_tokens: 1024,
  messages: [{ role: "user", content: `You are a content repurposing expert for DabCloud. Write a LinkedIn post with a bold hook, 3-5 insights, a question at end, 3-5 hashtags. SOURCE: """${content}""" Output ONLY the post.` }]
});
console.log(li.choices[0].message.content);

console.log("\n" + "=".repeat(60));
console.log("TWITTER THREAD");
console.log("=".repeat(60));

const tw = await client.chat.completions.create({
  model: "gpt-4o", max_tokens: 1024,
  messages: [{ role: "user", content: `You are a content repurposing expert for DabCloud. Write a 4-tweet Twitter thread numbered 1/4 to 4/4, each under 280 chars, blank line between tweets. SOURCE: """${content}""" Output ONLY the tweets.` }]
});
console.log(tw.choices[0].message.content);
