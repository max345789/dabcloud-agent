import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import OpenAI from "openai";

const __dirname = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(join(__dirname, "config/settings.json"), "utf-8"));
const client = new OpenAI({ apiKey: config.openai_api_key });

const items = [
  { title: "How to Repurpose a Blog Post", content: "Repurposing content is one of the smartest things a creator can do. Instead of writing from scratch every day, you take one well-researched piece and extract maximum value from it. Turn your blog post intro into a LinkedIn hook. Extract key facts for Twitter threads. Turn subheadings into Instagram carousels. One input, ten outputs." },
  { title: "5 Signs Your Business Needs a Content Strategy", content: "Most businesses create content reactively. Sign 1: Posting inconsistently. Sign 2: No idea what is working. Sign 3: Every piece starts from scratch. Sign 4: Content does not lead anywhere. Sign 5: Saying the same things as everyone else. A real strategy fixes all five." }
];

if (!existsSync(join(__dirname, "generated"))) mkdirSync(join(__dirname, "generated"));

for (const item of items) {
  console.log(`\nGenerating: ${item.title}`);
  let output = `${"=".repeat(60)}\n${item.title}\n${"=".repeat(60)}\n`;

  for (const platform of ["linkedin", "twitter"]) {
    console.log(`  → ${platform}...`);
    const res = await client.chat.completions.create({
      model: "gpt-4o", max_tokens: 1024,
      messages: [{ role: "user", content: `You are a content repurposing expert for DabCloud (dabcloud.in). Write a ${platform === "linkedin" ? "LinkedIn post with bold hook, 3-5 insights, question at end, 3-5 hashtags, max 1500 chars" : "4-tweet Twitter thread numbered 1/4 to 4/4, each under 280 chars, blank line between tweets"}. SOURCE: """${item.content}""" Output ONLY the ${platform === "linkedin" ? "post" : "tweets"}.` }]
    });
    const text = res.choices[0].message.content.trim();
    output += `\n--- ${platform.toUpperCase()} ---\n${text}\n`;
    console.log(`  ✓ ${platform} done (${text.length} chars)`);
  }

  const filename = item.title.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") + ".txt";
  writeFileSync(join(__dirname, "generated", filename), output);
  console.log(`  Saved to generated/${filename}`);
}

console.log("\n✅ All content generated! Check the generated/ folder.");
