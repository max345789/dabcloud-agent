#!/usr/bin/env node
/**
 * DabCloud Queue CLI
 * Usage:
 *   node add.js                          → interactive prompt
 *   node add.js --file article.txt       → read from file
 *   node add.js --list                   → show queue
 *   node add.js --clear-done             → remove done items from queue
 */

import { createInterface } from "readline";
import { readFileSync, existsSync } from "fs";
import { addToQueue, getPendingItems } from "./queue.js";

const args = process.argv.slice(2);

// ─── Show queue ───────────────────────────────────────────────────────────────
if (args.includes("--list")) {
  const items = getPendingItems();
  if (items.length === 0) {
    console.log("\n📭 Queue is empty. Add content with: node add.js\n");
  } else {
    console.log(`\n📋 Queue — ${items.length} pending item(s):\n`);
    items.forEach((item, i) => {
      console.log(`  ${i + 1}. [${item.id}] "${item.title}"`);
      console.log(`     Platforms: ${item.platforms} | Tone: ${item.tone}`);
      console.log(`     Added: ${item.created_at}\n`);
    });
  }
  process.exit(0);
}

// ─── Add from file ────────────────────────────────────────────────────────────
if (args.includes("--file")) {
  const fileIndex = args.indexOf("--file");
  const filePath = args[fileIndex + 1];

  if (!filePath || !existsSync(filePath)) {
    console.error("❌ File not found:", filePath);
    process.exit(1);
  }

  const content = readFileSync(filePath, "utf-8");
  const title = filePath.split("/").pop().replace(".txt", "").replace(".md", "");

  const id = addToQueue({
    title,
    content,
    tone: "Professional",
    platforms: "linkedin,twitter",
  });

  console.log(`✅ Added to queue as item #${id}`);
  console.log(`   Title: ${title}`);
  console.log(`   Run: node agent.js --force  to post immediately`);
  process.exit(0);
}

// ─── Interactive prompt ───────────────────────────────────────────────────────
const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((res) => rl.question(q, res));

async function interactive() {
  console.log("\n🟣 DabCloud — Add to Queue\n");

  const title = await ask("Title / topic: ");

  console.log("Paste your content below. When done, type END on a new line and press Enter:\n");

  let content = "";
  for await (const line of rl) {
    if (line.trim() === "END") break;
    content += line + "\n";
  }

  console.log("\nTone options:");
  console.log("  1. Professional");
  console.log("  2. Bold & Direct");
  console.log("  3. Casual & Friendly");
  console.log("  4. Inspirational");
  console.log("  5. Educational");
  const toneChoice = await ask("Choose tone [1-5, default 1]: ");
  const tones = ["Professional", "Bold & Direct", "Casual & Friendly", "Inspirational", "Educational"];
  const tone = tones[(parseInt(toneChoice) || 1) - 1] || "Professional";

  console.log("\nPlatform options: linkedin, twitter, facebook, instagram");
  const platformInput = await ask("Platforms (comma separated) [default: linkedin,twitter]: ");
  const platforms = platformInput.trim() || "linkedin,twitter";

  rl.close();

  if (!title || !content.trim()) {
    console.error("❌ Title and content are required.");
    process.exit(1);
  }

  const id = addToQueue({ title, content: content.trim(), tone, platforms });

  console.log(`\n✅ Added to queue as item #${id}`);
  console.log(`   Tone: ${tone}`);
  console.log(`   Platforms: ${platforms}`);
  console.log(`\n   Run: node agent.js --force    → post now`);
  console.log(`   Run: node agent.js             → post at scheduled times\n`);
}

interactive().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
