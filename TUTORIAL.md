# BUILD TUTORIAL — SCHMOOZZER LINKEDIN AUTOMATION
## For Atif — Step-by-step guide to building and deploying this system

---

## How to Use This Document

This tutorial walks you through building the Schmoozzer LinkedIn automation system from the project files provided. Each step has a clear objective, the files involved, and a verification checkpoint so you know it works before moving on.

Read SPEC.md first to understand the full picture. Then follow these steps in order.

---

## Prerequisites

Before starting, make sure you have:
- Node.js 18+ installed
- A Supabase project (free tier is fine for development)
- A Serper API account (serper.dev — free tier gives 2,500 searches/month)
- An Anthropic API key (for comment generation)
- Access to Paul's Hetzner server (for n8n workflows)
- A LinkedIn account for Schmoozzer (logged in on the dev machine)

---

## PHASE 1: DATABASE SETUP
### Objective: Supabase tables ready, target data imported

### Step 1.1 — Create Supabase Tables

1. Open your Supabase project dashboard
2. Go to SQL Editor
3. Open `db/schema.sql` from the project files
4. Copy the entire contents and run it in the SQL editor
5. This creates 6 tables: `targets`, `posts_seen`, `exclusion_keywords`, `comment_log`, `sessions`, `daily_stats`

**Checkpoint**: Go to Table Editor in Supabase. You should see all 6 tables listed. Each should have 0 rows.

### Step 1.2 — Configure Environment

1. Copy `.env.example` to `.env`
2. Fill in your Supabase URL and anon key (from Supabase → Settings → API)
3. Fill in your Serper API key
4. Leave `COMMENT_API_URL` empty for now — we'll set it up in Phase 4

**Checkpoint**: The `.env` file has real values for `SUPABASE_URL` and `SUPABASE_KEY`.

### Step 1.3 — Import Target Companies

1. Make sure `schmoozzer_targets.csv` is in the project root
2. Run: `npm install` (first time only)
3. Run: `node scripts/import-targets.js`
4. This imports all 2,010 companies into the `targets` table

**Checkpoint**: In Supabase Table Editor, the `targets` table should show 2,010 rows. All should have `status = 'pending_enrichment'`. Spot-check a few — company names, domains, and countries should look correct.

### Step 1.4 — Seed Exclusion Keywords

1. Run: `node scripts/seed-exclusion-keywords.js`
2. This populates the `exclusion_keywords` table with political terms, job post phrases, sensitive topics, etc.

**Checkpoint**: The `exclusion_keywords` table should have ~60+ rows. Check a few — "trump", "we're hiring", "passed away" should all be there.

---

## PHASE 2: ENRICHMENT PIPELINE
### Objective: Companies have LinkedIn pages, founder profiles, and emails

### Step 2.1 — Test Enrichment on a Small Batch

1. Run: `node scripts/run-enrichment.js --batch-size 5 --delay 2000`
2. This processes just 5 companies to verify the pipeline works
3. Watch the console output — it should show which data it found for each company

**Checkpoint**: In Supabase, filter the `targets` table by `status = 'enriched'`. You should see ~3-5 rows with `linkedin_company` URLs populated. Some may have `founder_linkedin` and `email` too. If you see `status = 'enrichment_error'` on all 5, check your Serper API key.

### Step 2.2 — Run Full Enrichment

1. Run: `node scripts/run-enrichment.js --batch-size 50 --delay 1200`
2. This processes 50 at a time with 1.2s between API calls
3. Run this multiple times or increase batch size to process all 2,010
4. At 3 searches per company and 1.2s delay, 50 companies takes ~3 minutes
5. Full 2,010 companies = ~40 runs of 50, or 8 runs of 250

**Important**: Track your Serper API usage. 2,010 companies × 3 searches = ~6,030 searches. Free tier is 2,500/month, so you may need a paid month or split across months.

**Checkpoint**: Most companies in the `targets` table should now have `status = 'enriched'` with `linkedin_company` URLs. Run this query in Supabase SQL editor:
```sql
SELECT status, COUNT(*) FROM targets GROUP BY status;
```
You want to see most rows as 'enriched'. Some 'enrichment_failed' is normal — not every small company has a LinkedIn page.

### Step 2.3 — Review Enrichment Quality

Spot-check 20 random enriched companies:
1. Open the `linkedin_company` URL — does it go to the right company?
2. Open the `founder_linkedin` URL — is this actually the founder/CEO?
3. Is the email reasonable (not spam, not generic)?

If accuracy is low, the search queries in `run-enrichment.js` may need tuning for specific industries. Adjust the query templates and re-run on failed companies.

---

## PHASE 3: ELECTRON APP
### Objective: App launches, connects to Supabase, browser automation works

### Step 3.1 — Install Dependencies

```bash
npm install
npx playwright install chromium
```

The second command installs the Chromium browser that Playwright will control.

**Checkpoint**: `node_modules` directory exists. `npx playwright --version` outputs a version number.

### Step 3.2 — First Launch (Manual LinkedIn Login)

1. Run: `npx electron .`
2. The app should open with a basic dashboard window
3. The Playwright browser won't be visible yet — that's fine
4. For the FIRST run, you need to manually log into LinkedIn in the Playwright browser

To do the initial login:
1. Temporarily modify `main.js` to open a visible browser window to linkedin.com
2. Log in manually with the Schmoozzer LinkedIn credentials
3. The session cookies will be saved in `./chrome-data`
4. From now on, the automation will reuse this session

**Note for Atif**: The `userDataDir: './chrome-data'` in the orchestrator config means Playwright persists cookies between runs. Paul only needs to log in once. If LinkedIn logs out (session expires), Paul will need to re-authenticate — the system should detect this and alert him.

**Checkpoint**: After manual login, close the app. Look in `./chrome-data` — it should contain browser profile files. Re-launch the app, and the Playwright browser should load LinkedIn without needing to log in again.

### Step 3.3 — Test Humanization Modules

Before running the full orchestrator, test each humanization module independently:

**Mouse test**:
```javascript
// Create a simple test script: test-mouse.js
const { chromium } = require('playwright');
const HumanMouse = require('./humanize/mouse');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  await page.goto('https://www.linkedin.com/feed/');
  
  const mouse = new HumanMouse(page);
  
  // Watch the mouse move in curves, not straight lines
  await mouse.moveTo(400, 300);
  await mouse.moveTo(800, 500);
  await mouse.moveTo(200, 600);
  
  // Try clicking something
  await mouse.click('.feed-shared-update-v2');
  
  await browser.close();
})();
```

**Typing test**:
```javascript
// test-typing.js
const { chromium } = require('playwright');
const HumanTyper = require('./humanize/typing');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  await page.goto('https://www.google.com');
  
  const typer = new HumanTyper(page);
  
  // Watch it type character by character with variable speed
  // Look for the planned typo, backspace, and correction
  await typer.typeText(
    'The partnerships angle is the underrated part of this conversation.',
    'textarea[name="q"]'
  );
  
  await new Promise(r => setTimeout(r, 5000));
  await browser.close();
})();
```

**What to watch for**:
- Mouse should move in curves, not straight lines
- Mouse should occasionally overshoot and correct
- Typing should have variable speed — faster for common pairs, slower at word boundaries
- Roughly 1 in 3-4 typing runs should have a typo that gets corrected

**Checkpoint**: All three modules (mouse, typing, scroll) behave visually like a human. Show Paul — he should not be able to distinguish it from real human interaction at normal speed.

### Step 3.4 — Build the Dashboard UI

The `renderer/index.html` needs a simple control dashboard. It should show:
- Start/Stop automation button
- Current status (idle, running, break, waiting)
- Today's stats (comments posted, posts scanned, posts skipped)
- Current session info (comments this session, target)
- A log of recent comments with timestamps

Use the IPC bridge in `preload.js` to communicate between the renderer and main process. The renderer calls `window.automation.start()`, `window.automation.stop()`, and polls `window.automation.status()`.

This doesn't need to be fancy — it's an internal tool. Function over form.

**Checkpoint**: The app launches, shows a dashboard, and the Start/Stop buttons trigger the IPC handlers in `main.js`.

---

## PHASE 4: COMMENT GENERATION API
### Objective: n8n webhook on Hetzner receives post content and returns AI-generated comments

### Step 4.1 — Create n8n Workflow

On the Hetzner server, create a new n8n workflow:

1. **Trigger**: Webhook node
   - Method: POST
   - Path: `/generate-comment`
   - Response mode: "Last Node"

2. **HTTP Request node** (call Anthropic API):
   - URL: `https://api.anthropic.com/v1/messages`
   - Method: POST
   - Headers:
     - `x-api-key`: your Anthropic key
     - `anthropic-version`: `2023-06-01`
     - `content-type`: `application/json`
   - Body (JSON):
   ```json
   {
     "model": "claude-sonnet-4-20250514",
     "max_tokens": 200,
     "system": "You are a professional but friendly commenter on LinkedIn. You are commenting from the account of a real person who runs a tech company. Your comments should sound like a knowledgeable peer chiming in — never like a brand account.\n\nRULES:\n- 1-3 sentences maximum. Short and natural.\n- NEVER mention any company name, product, service, or website.\n- NEVER include links or CTAs.\n- NEVER say 'check us out' or anything promotional.\n- Respond to the ACTUAL CONTENT of the post.\n- Vary your style: agree, add nuance, ask questions, share anecdotes.\n- Do NOT start with 'Great point' or 'Love this' or 'So true'.\n- Match the formality level of the original post.\n\nReturn ONLY the comment text. Nothing else.",
     "messages": [
       {
         "role": "user",
         "content": "Write a LinkedIn comment for this post by {{ $json.post_author }}:\n\n{{ $json.post_text }}{{ $json.extra_instruction ? '\n\nAdditional instruction: ' + $json.extra_instruction : '' }}"
       }
     ]
   }
   ```

3. **Function node** (extract the comment text):
   ```javascript
   const response = $input.first().json;
   const comment = response.content[0].text;
   return [{ json: { comment } }];
   ```

4. **Respond to Webhook node**:
   - Response body: `{{ JSON.stringify($json) }}`

### Step 4.2 — Test the Webhook

```bash
curl -X POST https://your-n8n.hetzner-server.com/webhook/generate-comment \
  -H "Content-Type: application/json" \
  -d '{
    "post_text": "Just shipped our biggest feature update of the year. 6 months of work, 3 engineers, and a lot of late nights. Sometimes the best strategy is just showing up every day.",
    "post_author": "Mike Chen, Founder at DataFlow",
    "extra_instruction": ""
  }'
```

**Checkpoint**: The response should contain a natural-sounding comment, 1-3 sentences, no product mentions, relevant to the post content. Run it 5 times — each response should be different in tone and structure.

### Step 4.3 — Update .env

Now that the webhook is working, update `.env`:
```
COMMENT_API_URL=https://your-n8n.hetzner-server.com/webhook/generate-comment
```

---

## PHASE 5: INTEGRATION TESTING
### Objective: Full loop works end to end

### Step 5.1 — Dry Run (Watch Mode)

Before letting it comment for real, do a watch-only run:

1. In `orchestrator.js`, temporarily comment out the actual comment submission (the `_postComment` method body) and replace with a console.log
2. Start the app
3. Watch it scan the feed, filter posts, generate comments, and log everything — but not actually post
4. Check Supabase: `posts_seen` should be filling up with entries. Some should have `skipped = true` with reasons.

**Checkpoint**: The system scans posts correctly, filters work (job posts skipped, keyword matches caught), and comment generation returns good text. The `posts_seen` table has accurate data.

### Step 5.2 — Live Run (Supervised)

1. Restore the `_postComment` method
2. Sit with the app running and watch the first 3-5 comments go out
3. Verify:
   - Mouse moves naturally to the comment area
   - Typing looks human (variable speed, maybe a typo correction)
   - Comment is posted successfully
   - LinkedIn doesn't show any warnings
   - The comment appears under the correct post

**Checkpoint**: 3-5 real comments posted on LinkedIn. No detection warnings. Comments look natural and contextual.

### Step 5.3 — Full Day Test

1. Start the app at 9 AM
2. Let it run unattended for a full day
3. Check periodically — is it taking breaks? Is it respecting the lunch window?
4. At end of day, review:
   - `daily_stats` table: how many comments, sessions, etc.
   - `comment_log`: read through all comments — are they good quality?
   - `posts_seen`: check skip reasons — are filters working correctly?
   - LinkedIn: no warnings, no restrictions

**Checkpoint**: Full day of operation with 40-80 comments posted (depends on feed density), proper break patterns, no LinkedIn issues.

---

## PHASE 6: FOLLOW AUTOMATION
### Objective: Automatically follow target companies on LinkedIn

### Step 6.1 — Build the Follower Module

The `automation/follower.js` file needs to:
1. Query Supabase for enriched targets with `followed = false` and `linkedin_company IS NOT NULL`
2. Navigate to the company's LinkedIn page
3. Use the humanization engine to find and click the Follow button
4. Wait, then verify the follow was successful (button changes to "Following")
5. Update Supabase: `followed = true`, `followed_at = now()`
6. Move to the next company after a random delay (30-120 seconds between follows)

The follower should run as a separate mode — not while commenting. You don't scroll the feed and follow companies at the same time. A good pattern:
- First 30 minutes of the day: follow 15-25 new companies
- Rest of the day: normal feed scanning and commenting

### Step 6.2 — Test Following

1. Run the follower on 5 companies manually
2. Verify each company page loads correctly
3. Verify the Follow button is found and clicked
4. Verify Supabase updates

**Checkpoint**: 5 new companies followed, Supabase records updated, no LinkedIn warnings.

---

## PHASE 7: MONITORING AND MAINTENANCE

### Ongoing Tasks

**Daily (automated)**:
- System runs 9-6, takes breaks, comments on feed posts
- Daily stats logged to Supabase

**Weekly (manual)**:
- Review comment quality — read 10 random comments from `comment_log`
- Check skip rates — are too many posts being skipped? Too few?
- Monitor LinkedIn for any warnings or restrictions
- Update `exclusion_keywords` if new sensitive topics emerge

**Monthly**:
- Run enrichment on any new targets added
- Review follower progress — how many of 2,010 are followed?
- Analyze which companies engage back (profile visits, connection requests)

### Common Issues and Fixes

**LinkedIn asks for verification/CAPTCHA**:
- Stop automation immediately
- Have Paul solve the CAPTCHA manually
- Wait 24 hours before resuming
- Reduce activity speed in config (increase break times)

**Comments seem repetitive**:
- Check `variety-checker.js` — the history size might be too small
- Add more variation instructions to the system prompt
- Review recent comments in `comment_log` and identify patterns

**Enrichment returns wrong LinkedIn pages**:
- The company name might be too generic (e.g., "Solutions Inc")
- Add domain to the search query for better specificity
- Manually verify and correct in Supabase

**LinkedIn session expires**:
- Paul needs to re-login in the Playwright browser
- Open the app, it should detect the expired session
- Log in manually, session persists for next run

**Selectors break (LinkedIn DOM update)**:
- LinkedIn updates their frontend periodically
- When comments stop working or posts aren't found, inspect the page
- Update `utils/linkedin-selectors.js` with new selectors
- This is the ONLY file that needs to change for DOM updates

---

## FILE REFERENCE

```
linkedin-automation/
├── SPEC.md                           ← Full project specification
├── TUTORIAL.md                       ← This file
├── package.json                      ← Dependencies and scripts
├── main.js                           ← Electron main process
├── preload.js                        ← IPC bridge
├── .env.example                      ← Environment template
├── schmoozzer_targets.csv            ← Cleaned 2,010 company list
├── config/
│   └── schmoozzer.json               ← All configurable parameters
├── db/
│   └── schema.sql                    ← Supabase table definitions
├── scripts/
│   ├── import-targets.js             ← CSV → Supabase importer
│   ├── seed-exclusion-keywords.js    ← Populates keyword filter
│   └── run-enrichment.js             ← Google search enrichment
├── automation/
│   └── orchestrator.js               ← Main control loop
├── humanize/
│   ├── mouse.js                      ← Bézier curve mouse movements
│   ├── typing.js                     ← Character-by-character with typos
│   ├── scroll.js                     ← Human-like feed scrolling
│   └── timing.js                     ← Schedule, breaks, sessions
├── filters/
│   ├── post-filter.js                ← Keyword/type/staleness checks
│   └── variety-checker.js            ← Comment pattern detection
└── utils/
    ├── logger.js                     ← Structured logging
    └── linkedin-selectors.js         ← All LinkedIn CSS selectors
```

---

## IMPORTANT NOTES FOR ATIF

1. **Never commit `.env` to git.** The `.env.example` is the template. Real keys stay local.

2. **The `chrome-data` directory contains LinkedIn session cookies.** Never commit this either. Add both to `.gitignore`.

3. **LinkedIn selectors WILL break.** When they do, update `linkedin-selectors.js` only. Don't hardcode selectors anywhere else.

4. **Test humanization visually.** The mouse, typing, and scroll modules need to LOOK human. Show Paul — if he can tell it's automated, it's not ready.

5. **Start slow.** First week: 5 comments per session, 20-minute breaks. Once LinkedIn shows no warnings for a week, increase to the full 7-10.

6. **This is Marina's engine.** Everything you build here becomes the foundation for Rplacd client automation. Keep the code modular — config-driven, not hardcoded. When a paying client comes, you'll add a `client_id` column to every table and load their config instead of `schmoozzer.json`.
