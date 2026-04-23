# SCHMOOZZER LINKEDIN AUTOMATION — COMPLETE SPECIFICATION
## A.K.A. Marina's Core Engine (Build Once, Use Twice)

---

## What This Is

An automated LinkedIn engagement system that:
1. Takes a list of 2,010 target companies (SMBs using Active Campaign, US/UK/CA/AU)
2. Enriches each company with LinkedIn page, founder profile, and email
3. Follows each company on LinkedIn from the Schmoozzer company page
4. Monitors the LinkedIn feed for posts from followed companies
5. Generates contextual, human-sounding comments in Schmoozzer's voice
6. Posts comments via browser automation that looks indistinguishable from a human

This same engine becomes Marina's automation layer for Rplacd paying clients — just with configurable parameters and metering.

---

## Architecture Split

### Cloud (Hetzner / n8n)
- **Enrichment pipeline**: Takes domain → finds LinkedIn company page, founder LinkedIn, founder name, email
- **Comment generation**: AI generates contextual comments based on post content
- **Database**: Supabase stores targets, post history, comment log, exclusion keywords
- **Scheduling engine**: Manages operating hours, breaks, daily limits

### Local (Electron app on Paul's laptop)
- **Browser automation**: Playwright controlling a real Chrome/Chromium instance
- **Humanization engine**: Mouse movements, typing simulation, scroll behavior
- **Session management**: Uses Paul's real LinkedIn cookies/session
- **Feed scanner**: Scrolls feed, captures posts, checks against seen-posts database

The split is non-negotiable. LinkedIn detects server-side automation by IP, browser fingerprint, and behavioral patterns. The Electron app runs from Paul's machine with his real browser profile.

---

## Pipeline Stages

### Stage 1 — Enrichment (Cloud)

**Input**: `schmoozzer_targets.csv` (2,010 companies with domain, company name, existing social data)

**Process per company**:
1. Google search via Serper API: `"{company_name}" site:linkedin.com/company`
2. Google search via Serper API: `"{company_name}" {domain} site:linkedin.com/in` (for founder)
3. Google search via Serper API: `"{company_name}" {domain} email contact`
4. Parse results, extract LinkedIn URLs and email addresses
5. Update Supabase record with enriched data
6. Mark status: `enriched` or `enrichment_failed`

**Rate limiting**: Serper API allows 2,500 searches/month on free tier, paid tiers much higher. At 3 searches per company × 2,010 companies = ~6,030 searches needed. Budget for a paid Serper month or batch over 3 months on free tier.

**Output columns added**: `linkedin_company`, `founder_linkedin`, `founder_name`, `email`

### Stage 2 — Follow (Electron)

**Input**: Enriched companies with LinkedIn company pages

**Process**:
1. Open LinkedIn company page in Playwright browser
2. Click "Follow" button
3. Log follow action in Supabase
4. Mark `followed: yes` with timestamp

**Pace**: 15-25 follows per day (randomized). At 20/day average, the full 2,010 list takes ~100 business days.

**Humanization**: Every navigation and click goes through the humanization engine. No direct element injection.

### Stage 3 — Feed Scan + Comment (Electron)

**Process (runs continuously during operating hours)**:
1. Navigate to LinkedIn feed
2. Scroll through feed at human pace
3. For each post encountered:
   a. Extract post ID, author company, post text, post type
   b. Check against `posts_seen` database — skip if already seen
   c. Check if author is in our target list — skip if not
   d. Run through exclusion filter (keywords, post types)
   e. If passes all filters → send post content to comment generation API
   f. Receive generated comment
   g. Type comment using humanization engine
   h. Submit comment
   i. Log everything to Supabase
4. After 7-10 posts commented (randomized per session), take a 15-25 minute break
5. Repeat until end of operating hours

---

## Humanization Engine

### Purpose
Make every browser interaction indistinguishable from a real human using LinkedIn.

### Module: Mouse Movement (`humanize/mouse.js`)

**Bézier curve paths**: Never move in straight lines. Generate control points that create natural curves between start and end positions.

**Acceleration profile**: Start slow, accelerate, decelerate near target. Real humans don't move at constant speed.

**Overshoot and correct**: ~20% of movements slightly overshoot the target element, pause 50-150ms, then micro-correct to the actual target.

**Idle drift**: When "reading" a post (waiting before commenting), the mouse occasionally drifts to random positions on the page — sidebar, another post, empty space — then returns.

**Jitter**: Tiny random perturbations (1-3px) during movement to simulate hand tremor.

### Module: Typing Simulation (`humanize/typing.js`)

**Character-by-character**: Each keystroke has a variable delay:
- Base delay: 50-120ms between characters
- Faster for common bigrams (th, he, in, er, an)
- Slower at word boundaries (space key): 80-200ms
- Slower after punctuation: 150-300ms
- Occasional burst (3-5 chars fast, then pause)

**Planned typos**: 1 in every 3-4 comments includes a typo:
- Mid-word character swap or wrong adjacent key
- Pause 200-500ms (noticing the error)
- Backspace to error point (sometimes overshooting by 1 character)
- Retype correctly
- Sometimes the backspace itself overshoots — deletes one extra char, retypes it

**Copy/paste behavior**: For search queries and URL navigation, simulate Ctrl+A, Ctrl+C, click target field, Ctrl+V — not direct text injection.

### Module: Scroll Behavior (`humanize/scroll.js`)

**Variable scroll speed**: Not uniform. Faster through empty space, slower when "reading" a post.

**Read pause**: When encountering a post we'll comment on, pause 3-8 seconds (simulating reading). For posts we skip, shorter pause (0.5-2 seconds) or no pause.

**Scroll distance**: Variable per scroll action (200-600px). Sometimes scroll past a post and scroll back up.

**Momentum**: Scroll actions have easing — fast start, gradual stop.

### Module: Timing Patterns (`humanize/timing.js`)

**Operating hours**: Monday-Friday, 9:00 AM - 6:00 PM (owner's timezone)

**Lunch break**: 1 hour, start time randomized between 11:30 AM and 1:00 PM each day

**Session pattern**:
- Comment on 7-10 posts (randomized per session)
- Break for 15-25 minutes (randomized)
- Resume next session

**Daily variance**:
- Some days more active (10-12 sessions), some less (6-8)
- Slightly different start time each day (±15 minutes from 9:00)
- Different lunch time each day
- Taper activity in last hour (fewer comments, more browsing)

**Inter-action delays**: Between reading a post and starting to type, 2-5 second pause. Between finishing typing and clicking submit, 0.5-2 seconds.

### Configuration Object

```javascript
// Default config for Schmoozzer — Marina clients get their own
const HUMANIZE_CONFIG = {
  operatingHours: { start: 9, end: 18 },  // 24h format
  lunchBreak: { earliest: 11.5, latest: 13, duration: 60 },  // minutes
  session: { 
    minComments: 7, 
    maxComments: 10,
    breakMinMinutes: 15,
    breakMaxMinutes: 25
  },
  typing: {
    baseDelayMin: 50,
    baseDelayMax: 120,
    typoFrequency: 0.28,  // ~1 in 3.5 comments
    wordBoundaryExtraDelay: 80
  },
  mouse: {
    overshootProbability: 0.2,
    idleDriftInterval: 8000,  // ms between idle movements
    jitterAmplitude: 2  // pixels
  },
  scroll: {
    readPauseMin: 3000,
    readPauseMax: 8000,
    skipPauseMin: 500,
    skipPauseMax: 2000,
    distanceMin: 200,
    distanceMax: 600
  },
  daily: {
    startVarianceMinutes: 15,
    activityTaper: true  // reduce activity in last hour
  }
};
```

---

## Post Filter System

### Filter Pipeline (`filters/post-filter.js`)

Every post goes through these checks in order. First failure = skip.

1. **Already seen?** → Check `posts_seen` table by post ID
2. **From a target company?** → Check if author is in our target list
3. **Job post?** → LinkedIn tags job listings — auto-skip
4. **Reshare of job post?** → Check if shared content is a job listing
5. **Keyword exclusion?** → Check post text against keyword exclusion list
6. **Sensitive topic detection?** → Lightweight classification: is this about business/industry or something we should avoid?
7. **Too old?** → Skip posts older than 48 hours (stale engagement looks robotic)

### Keyword Exclusion List (Supabase table: `exclusion_keywords`)

Initial list:
```
trump, biden, harris, politics, political, election, vote, voting,
israel, palestine, gaza, hamas, hormuz, iran, war, military, conflict,
abortion, gun control, immigration, refugee, protest,
hiring, we're hiring, job opening, job alert, apply now, join our team,
rip, passed away, funeral, condolences, thoughts and prayers,
lawsuit, sued, legal action, indictment
```

**Management**: Add/remove keywords via Supabase dashboard or future admin UI. No code changes needed.

### Skip Logging

Every skipped post is logged with the reason:
```json
{
  "post_id": "urn:li:activity:7051234567890",
  "author": "Fitbliss",
  "skip_reason": "keyword_match",
  "keyword_matched": "we're hiring",
  "timestamp": "2026-04-21T14:32:00Z"
}
```

This lets you audit filter behavior and tune it over time.

---

## Comment Generation

### API: Claude Sonnet (via Anthropic API on Hetzner)

**Why Sonnet, not a local model**: Comments need to be genuinely good — varied, contextual, natural. This is the brand's public voice. Sonnet's quality justifies the API cost (~$0.003-0.01 per comment at current pricing).

### System Prompt

```
You are a professional but friendly commenter on LinkedIn. You are commenting
from the account of a real person who runs a tech company. Your comments should
sound like a knowledgeable peer chiming in — never like a brand account.

RULES:
- 1-3 sentences maximum. Short and natural.
- NEVER mention any company name, product, service, or website.
- NEVER include links or CTAs.
- NEVER say "check us out" or "we do something similar" or anything promotional.
- Respond to the ACTUAL CONTENT of the post. Show you read it.
- Vary your style: sometimes agree, sometimes add nuance, sometimes ask a
  genuine question, sometimes share a brief anecdote. Never fall into patterns.
- Do NOT start every comment with "Great point" or "Love this" or "So true."
- Occasional light humor is good when the post tone allows it.
- Match the formality level of the original post.
- If the post shares a specific number or result, engage with that specifically.
- If the post shares an opinion, engage with the opinion itself.

You will receive the full text of a LinkedIn post. Return ONLY the comment text.
Nothing else.
```

### Input/Output

**Input to API**:
```json
{
  "post_text": "We just hit 1000 customers without spending a dollar on ads. Content marketing + partnerships did all the heavy lifting.",
  "post_author": "Sarah Chen, CEO at GrowthLab",
  "post_industry": "Business And Industrial"
}
```

**Output from API**:
```
"The partnerships angle is the underrated part of this. Most people talk about content but the compounding effect of two audiences seeing you through a trusted source is completely different from cold traffic. Curious what your partnership structure looked like — rev share, co-marketing, or something else?"
```

### Comment Variety Enforcement

To prevent pattern detection, the system tracks the last 20 comments and ensures:
- No two consecutive comments start with the same word
- No more than 2 of the last 10 comments end with a question
- Average comment length varies between 15-50 words
- No repeated phrases across recent comments

If a generated comment violates any of these, regenerate with an additional instruction noting the violation.

---

## Database Schema (Supabase)

### Table: `targets`
```sql
CREATE TABLE targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain TEXT NOT NULL,
  company_name TEXT NOT NULL,
  industry TEXT,
  city TEXT,
  state TEXT,
  country TEXT,
  twitter TEXT,
  instagram TEXT,
  social_followers TEXT,
  employee_count TEXT,
  linkedin_company TEXT,
  founder_linkedin TEXT,
  founder_name TEXT,
  email TEXT,
  followed BOOLEAN DEFAULT FALSE,
  followed_at TIMESTAMPTZ,
  status TEXT DEFAULT 'pending_enrichment',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Table: `posts_seen`
```sql
CREATE TABLE posts_seen (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id TEXT UNIQUE NOT NULL,
  author_name TEXT,
  author_linkedin TEXT,
  target_id UUID REFERENCES targets(id),
  post_text TEXT,
  post_type TEXT,
  seen_at TIMESTAMPTZ DEFAULT NOW(),
  commented BOOLEAN DEFAULT FALSE,
  comment_text TEXT,
  commented_at TIMESTAMPTZ,
  skipped BOOLEAN DEFAULT FALSE,
  skip_reason TEXT,
  skip_detail TEXT
);
```

### Table: `exclusion_keywords`
```sql
CREATE TABLE exclusion_keywords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword TEXT NOT NULL UNIQUE,
  category TEXT,  -- 'political', 'sensitive', 'job_post', 'custom'
  added_at TIMESTAMPTZ DEFAULT NOW(),
  added_by TEXT DEFAULT 'system'
);
```

### Table: `comment_log`
```sql
CREATE TABLE comment_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id TEXT NOT NULL,
  target_id UUID REFERENCES targets(id),
  comment_text TEXT NOT NULL,
  generated_at TIMESTAMPTZ,
  posted_at TIMESTAMPTZ,
  session_id TEXT,
  post_content_snippet TEXT,
  status TEXT DEFAULT 'pending'  -- pending, posted, failed
);
```

### Table: `sessions`
```sql
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  comments_made INTEGER DEFAULT 0,
  posts_scanned INTEGER DEFAULT 0,
  posts_skipped INTEGER DEFAULT 0,
  break_after BOOLEAN DEFAULT FALSE,
  break_duration_minutes INTEGER,
  status TEXT DEFAULT 'active'  -- active, break, completed, error
);
```

### Table: `daily_stats`
```sql
CREATE TABLE daily_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE UNIQUE NOT NULL,
  total_comments INTEGER DEFAULT 0,
  total_posts_scanned INTEGER DEFAULT 0,
  total_posts_skipped INTEGER DEFAULT 0,
  total_follows INTEGER DEFAULT 0,
  sessions_completed INTEGER DEFAULT 0,
  operating_start TIMESTAMPTZ,
  operating_end TIMESTAMPTZ,
  lunch_start TIMESTAMPTZ,
  lunch_end TIMESTAMPTZ
);
```

---

## Electron App Structure

```
schmoozzer-automation/
├── package.json
├── main.js                    # Electron main process
├── preload.js                 # Bridge between main and renderer
├── renderer/
│   ├── index.html             # Dashboard UI
│   ├── dashboard.js           # Stats display, controls
│   └── styles.css
├── automation/
│   ├── orchestrator.js        # Main loop — schedule, sessions, breaks
│   ├── feed-scanner.js        # Scroll feed, extract posts
│   ├── commenter.js           # Generate + post comments
│   ├── follower.js            # Follow companies
│   └── enricher-client.js     # Calls cloud enrichment API
├── humanize/
│   ├── mouse.js               # Bézier mouse movements
│   ├── typing.js              # Character-by-character typing with typos
│   ├── scroll.js              # Human-like scrolling
│   ├── timing.js              # Delays, breaks, operating hours
│   └── config.js              # Configurable parameters
├── filters/
│   ├── post-filter.js         # Keyword, type, staleness checks
│   └── variety-checker.js     # Comment pattern detection
├── db/
│   ├── supabase-client.js     # Supabase connection
│   ├── targets.js             # Target company queries
│   ├── posts.js               # Post tracking queries
│   └── stats.js               # Daily stats queries
├── utils/
│   ├── logger.js              # Structured logging
│   └── linkedin-selectors.js  # CSS selectors for LinkedIn elements
└── config/
    ├── default.json           # Default humanization config
    └── schmoozzer.json        # Schmoozzer-specific overrides
```

---

## Cloud Components (Hetzner)

### n8n Workflow: Enrichment Pipeline

**Trigger**: Manual or scheduled (process N companies per run)

**Steps**:
1. Query Supabase for companies with status `pending_enrichment` (batch of 50)
2. For each company:
   a. Call Serper API: `"{company_name}" site:linkedin.com/company`
   b. Parse top result for LinkedIn company URL
   c. Call Serper API: `"{company_name}" {domain} founder OR ceo OR owner site:linkedin.com/in`
   d. Parse top result for founder LinkedIn URL and name
   e. Call Serper API: `"{company_name}" {domain} email contact`
   f. Parse results for email addresses
   g. Update Supabase record
3. Rate limit: 1 search per second to stay within Serper limits
4. Log results and errors

### n8n Workflow: Comment Generation

**Trigger**: Webhook from Electron app (post content needs a comment)

**Steps**:
1. Receive post content + author info
2. Call Anthropic API with system prompt + post content
3. Receive generated comment
4. Return comment to Electron app
5. Log in Supabase

### n8n Workflow: Daily Report

**Trigger**: Scheduled (6 PM daily)

**Steps**:
1. Query Supabase for today's `daily_stats`
2. Query recent `comment_log` entries
3. Format summary
4. Send via preferred channel (email/in-app)

---

## LinkedIn Selector Management

LinkedIn changes their DOM frequently. All CSS selectors are centralized in one file (`linkedin-selectors.js`) so updates only require changing one file.

```javascript
// linkedin-selectors.js
// Last verified: April 2026
// Update these when LinkedIn changes their DOM

module.exports = {
  feed: {
    container: '.scaffold-finite-scroll__content',
    postCard: '.feed-shared-update-v2',
    postText: '.feed-shared-update-v2__description',
    postAuthor: '.update-components-actor__name',
    postAuthorSubtitle: '.update-components-actor__description',
    postTimestamp: '.update-components-actor__sub-description',
    postId: '[data-urn]',
    commentBox: '.comments-comment-box__form',
    commentInput: '.ql-editor',
    commentSubmit: '.comments-comment-box__submit-button',
    showMoreText: '.feed-shared-inline-show-more-text',
    jobBadge: '.job-posting-badge',
  },
  companyPage: {
    followButton: '.follow-button, .org-top-card-primary-actions__action',
    followingIndicator: '.org-top-card-primary-actions__following',
  },
  general: {
    scrollContainer: '.application-outlet',
    feedTab: 'a[href="/feed/"]',
  }
};
```

---

## Error Handling

### LinkedIn Detection Responses

If LinkedIn shows any of these, the system pauses immediately:
- CAPTCHA / verification challenge → Stop all activity, alert owner
- "Unusual activity" warning → Stop for 24 hours
- Rate limit response (429) → Exponential backoff
- Session expired / login required → Alert owner to re-authenticate

### Network Errors
- Supabase unreachable → Queue actions locally, sync when restored
- Serper API error → Skip company, retry next batch
- Anthropic API error → Use fallback comment templates (last resort)

### Graceful Degradation
The system should always fail safe — if anything is uncertain, don't post. A missed comment opportunity costs nothing. A flagged account costs everything.

---

## Future: Marina Client Mode

When this becomes Marina's engine for Rplacd clients:

### What Changes:
- Config object loads from client's Supabase record instead of `schmoozzer.json`
- Metering: track comments against monthly allocation
- Client's own exclusion keywords added to the filter
- Client's own LinkedIn session in their Electron app
- Client's own target list (they provide or Marina builds)

### What Stays the Same:
- Humanization engine (identical, different config values)
- Filter pipeline (same logic, different keyword sets)
- Comment generation (same API, different voice prompt per client)
- Database schema (partitioned by client ID)
- All Electron automation code

### Config Differences:
```javascript
// Schmoozzer (unlimited)
{ metering: { enabled: false } }

// Marina client (metered)
{ metering: { enabled: true, monthlyCommentLimit: 200, monthlyFollowLimit: 100 } }
```

---

## Security Notes

- LinkedIn credentials never leave the Electron app. No passwords stored in Supabase.
- Serper API key stored in n8n credentials, not in code.
- Anthropic API key stored in n8n credentials.
- Supabase service role key in Electron app's environment variables (not committed to git).
- The Electron app connects to Supabase via the anon key with RLS policies.
