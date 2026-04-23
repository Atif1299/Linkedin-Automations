-- Schmoozzer / Marina LinkedIn Automation — Database Schema
-- Run this in your Supabase SQL editor to create all tables

-- ═══ TARGETS ═══
-- The 2,010 companies we're engaging with
CREATE TABLE IF NOT EXISTS targets (
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

CREATE INDEX idx_targets_status ON targets(status);
CREATE INDEX idx_targets_followed ON targets(followed);
CREATE INDEX idx_targets_linkedin ON targets(linkedin_company);

-- ═══ POSTS SEEN ═══
-- Every post we encounter on the feed
CREATE TABLE IF NOT EXISTS posts_seen (
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

CREATE INDEX idx_posts_seen_post_id ON posts_seen(post_id);
CREATE INDEX idx_posts_seen_target ON posts_seen(target_id);
CREATE INDEX idx_posts_seen_date ON posts_seen(seen_at);

-- ═══ EXCLUSION KEYWORDS ═══
-- Words/phrases that cause a post to be skipped
CREATE TABLE IF NOT EXISTS exclusion_keywords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword TEXT NOT NULL UNIQUE,
  category TEXT,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  added_by TEXT DEFAULT 'system'
);

CREATE INDEX idx_exclusion_keyword ON exclusion_keywords(keyword);

-- ═══ COMMENT LOG ═══
-- Detailed log of every comment generated and posted
CREATE TABLE IF NOT EXISTS comment_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id TEXT NOT NULL,
  target_id UUID REFERENCES targets(id),
  comment_text TEXT NOT NULL,
  generated_at TIMESTAMPTZ,
  posted_at TIMESTAMPTZ,
  session_id UUID,
  post_content_snippet TEXT,
  status TEXT DEFAULT 'pending'
);

CREATE INDEX idx_comment_log_session ON comment_log(session_id);
CREATE INDEX idx_comment_log_target ON comment_log(target_id);
CREATE INDEX idx_comment_log_date ON comment_log(posted_at);

-- ═══ SESSIONS ═══
-- Each burst of activity (7-10 comments then break)
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  comments_made INTEGER DEFAULT 0,
  posts_scanned INTEGER DEFAULT 0,
  posts_skipped INTEGER DEFAULT 0,
  break_after BOOLEAN DEFAULT FALSE,
  break_duration_minutes INTEGER,
  status TEXT DEFAULT 'active'
);

CREATE INDEX idx_sessions_date ON sessions(started_at);

-- ═══ DAILY STATS ═══
-- Aggregated daily metrics
CREATE TABLE IF NOT EXISTS daily_stats (
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

CREATE INDEX idx_daily_stats_date ON daily_stats(date);

-- ═══ UPSERT FUNCTION FOR DAILY STATS ═══
CREATE OR REPLACE FUNCTION upsert_daily_stats(
  p_date DATE,
  p_comments INTEGER,
  p_sessions INTEGER
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO daily_stats (date, total_comments, sessions_completed)
  VALUES (p_date, p_comments, p_sessions)
  ON CONFLICT (date)
  DO UPDATE SET
    total_comments = EXCLUDED.total_comments,
    sessions_completed = EXCLUDED.sessions_completed;
END;
$$ LANGUAGE plpgsql;

-- ═══ RLS POLICIES ═══
-- Enable RLS on all tables
ALTER TABLE targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts_seen ENABLE ROW LEVEL SECURITY;
ALTER TABLE exclusion_keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE comment_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_stats ENABLE ROW LEVEL SECURITY;

-- For now, allow full access via service role (n8n and scripts use service key)
-- The Electron app uses anon key — add appropriate policies for production
CREATE POLICY "Allow all for authenticated" ON targets FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated" ON posts_seen FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated" ON exclusion_keywords FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated" ON comment_log FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated" ON sessions FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated" ON daily_stats FOR ALL USING (true);
