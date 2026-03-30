# DabCloud Agent — Setup Guide

A background agent that runs on your Mac, reads your content queue, generates platform-ready posts using Claude AI, and posts them automatically.

---

## FOLDER STRUCTURE

```
dabcloud-agent/
├── agent.js              ← main agent (runs in background)
├── generator.js          ← Claude API content generator
├── poster.js             ← posts to LinkedIn, Twitter, Facebook
├── queue.js              ← manages the content queue
├── add.js                ← CLI to add content to queue
├── logger.js             ← logging
├── package.json
├── config/
│   └── settings.json     ← YOUR KEYS AND SETTINGS GO HERE
├── content/
│   └── queue.csv         ← content waiting to be posted
├── posted/
│   └── posted.csv        ← log of everything posted
└── logs/
    └── agent-YYYY-MM-DD.log
```

---

## STEP 1 — Install Node.js on your Mac

Open Terminal and run:
```bash
brew install node
```

If you don't have Homebrew:
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

---

## STEP 2 — Copy the agent to your Mac

```bash
cp -r dabcloud-agent ~/dabcloud-agent
cd ~/dabcloud-agent
npm install
```

---

## STEP 3 — Fill in your API keys

Open `config/settings.json` and fill in:

| Key | Where to get it |
|-----|----------------|
| `claude_api_key` | console.anthropic.com → API Keys |
| `linkedin.access_token` | developers.linkedin.com → OAuth token |
| `linkedin.person_urn` | your LinkedIn profile ID |
| `twitter.api_key` etc. | developer.twitter.com → your app |
| `facebook.page_access_token` | developers.facebook.com |

Start with LinkedIn + Twitter only (set others to `"enabled": false`).

---

## STEP 4 — Add content to the queue

**Option A: Interactive (recommended)**
```bash
cd ~/dabcloud-agent
node add.js
```
Follow the prompts — paste your blog post, pick tone, pick platforms.

**Option B: From a text file**
```bash
node add.js --file ~/Documents/my-blog-post.txt
```

**Check what's in the queue:**
```bash
node add.js --list
```

---

## STEP 5 — Test it manually first

```bash
cd ~/dabcloud-agent
node agent.js --force
```

This runs immediately without waiting for a scheduled time.
Watch the Terminal output to see what it generates and posts.

---

## STEP 6 — Run in background automatically

### Make it start when your Mac boots:

1. Edit the plist file — replace `YOUR_MAC_USERNAME` with your actual username:
   ```bash
   whoami  # shows your username
   ```

2. Copy plist to the right place:
   ```bash
   cp ~/dabcloud-agent/in.dabcloud.agent.plist ~/Library/LaunchAgents/
   ```

3. Load it:
   ```bash
   launchctl load ~/Library/LaunchAgents/in.dabcloud.agent.plist
   launchctl start in.dabcloud.agent
   ```

4. Verify it's running:
   ```bash
   launchctl list | grep dabcloud
   ```

The agent now runs silently in the background every time your Mac is on.

---

## DAILY WORKFLOW

Your daily flow becomes:

1. Write / find a blog post or article
2. Run: `node add.js` → paste content → 30 seconds
3. Agent handles the rest automatically at 8am, 12pm, 6pm IST

---

## CONTROL COMMANDS

| Command | What it does |
|---------|-------------|
| `node agent.js --force` | Post immediately right now |
| `node add.js` | Add content interactively |
| `node add.js --list` | See pending queue |
| `node add.js --file post.txt` | Add content from a file |
| `launchctl stop in.dabcloud.agent` | Pause the background agent |
| `launchctl start in.dabcloud.agent` | Resume the background agent |

---

## VIEWING LOGS

```bash
tail -f ~/dabcloud-agent/logs/agent-$(date +%Y-%m-%d).log
```

---

## CHANGING POST TIMES

Edit `config/settings.json`:
```json
"post_times": ["08:00", "12:00", "18:00"]
```
Times are in IST (Indian Standard Time).

---

## ADDING NEW BLOG POSTS

Just drop them in as text files and run:
```bash
node add.js --file ~/path/to/post.txt
```

Or paste directly with `node add.js`.

---

## INSTAGRAM NOTE

Instagram requires an image with every post (API limitation).
For now, post Instagram manually using the generated caption.
Image auto-generation (via DALL·E) can be added as a future step.

---

Built for DabCloud — dabcloud.in
