/**
 * Electron Main Process
 *
 * Entry point for the Schmoozzer automation app.
 * Manages the dashboard window and automation lifecycle.
 */

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const Orchestrator = require('./orchestrator');
const CompanyFollower = require('./follower');
const config = require('./schmoozzer.json');

require('dotenv').config();

// Override config with environment variables
config.supabaseUrl = process.env.SUPABASE_URL || config.supabaseUrl;
config.supabaseKey = process.env.SUPABASE_KEY || config.supabaseKey;
config.commentApiUrl = process.env.COMMENT_API_URL || config.commentApiUrl;
config.dryRun = ['1', 'true', 'yes'].includes(String(process.env.AUTOMATION_DRY_RUN || '').toLowerCase());
config.timing = config.timing || {};
config.dashboardTimezone =
  process.env.DASHBOARD_TIMEZONE || config.dashboardTimezone || config.timing.dashboardTimezone;
if (process.env.AUTOMATION_ALWAYS_ON !== undefined) {
  config.timing.alwaysOn = ['1', 'true', 'yes'].includes(
    String(process.env.AUTOMATION_ALWAYS_ON || '').toLowerCase()
  );
}

const dashboardTimezone = config.dashboardTimezone || 'Europe/London';

let mainWindow;
let orchestrator;
let follower;
let followerLastResult = null;

function getDashboardDateKey(timezone) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: timezone }).format(new Date());
}

function getSupabase() {
  const url = config.supabaseUrl;
  const key = config.supabaseKey;
  if (!url || !key || url.includes('YOUR_')) return null;
  return createClient(url, key);
}

async function countTargets(supabase, filter) {
  const { count, error } = await supabase
    .from('targets')
    .select('*', { count: 'exact', head: true })
    .match(filter);
  if (error) return null;
  return count ?? 0;
}

async function fetchDashboardData() {
  const supabase = getSupabase();
  const dateKey = getDashboardDateKey(dashboardTimezone);
  const empty = {
    dateKey,
    dashboardTimezone,
    dailyStats: null,
    todaySessions: { comments_made: 0, posts_scanned: 0, posts_skipped: 0 },
    recentComments: [],
    targets: {
      enriched: null,
      pending_enrichment: null,
      enrichment_failed: null,
      enrichment_error: null,
      followed: null,
      follow_queue: null,
    },
    error: supabase ? null : 'supabase_not_configured',
  };

  if (!supabase) return empty;

  try {
    const [
      dailyRes,
      sessionsRes,
      commentsRes,
      cEnriched,
      cPending,
      cFailed,
      cError,
      cFollowed,
      followQueueRes,
    ] = await Promise.all([
      supabase.from('daily_stats').select('*').eq('date', dateKey).maybeSingle(),
      supabase
        .from('sessions')
        .select('comments_made, posts_scanned, posts_skipped, started_at')
        .gte('started_at', new Date(Date.now() - 72 * 3600000).toISOString()),
      supabase
        .from('comment_log')
        .select('id, post_id, posted_at, generated_at, comment_text, post_content_snippet, status')
        .order('generated_at', { ascending: false })
        .limit(25),
      countTargets(supabase, { status: 'enriched' }),
      countTargets(supabase, { status: 'pending_enrichment' }),
      countTargets(supabase, { status: 'enrichment_failed' }),
      countTargets(supabase, { status: 'enrichment_error' }),
      countTargets(supabase, { followed: true }),
      supabase
        .from('targets')
        .select('*', { count: 'exact', head: true })
        .eq('followed', false)
        .not('linkedin_company', 'is', null),
    ]);

    let todaySessions = { comments_made: 0, posts_scanned: 0, posts_skipped: 0 };
    const rows = sessionsRes.data || [];
    for (const row of rows) {
      if (!row.started_at) continue;
      const rowDay = new Intl.DateTimeFormat('sv-SE', { timeZone: dashboardTimezone }).format(
        new Date(row.started_at)
      );
      if (rowDay !== dateKey) continue;
      todaySessions.comments_made += row.comments_made || 0;
      todaySessions.posts_scanned += row.posts_scanned || 0;
      todaySessions.posts_skipped += row.posts_skipped || 0;
    }

    return {
      dateKey,
      dashboardTimezone,
      dailyStats: dailyRes.data || null,
      dailyStatsError: dailyRes.error?.message,
      todaySessions,
      sessionsError: sessionsRes.error?.message,
      recentComments: commentsRes.data || [],
      recentCommentsError: commentsRes.error?.message,
      targets: {
        enriched: cEnriched,
        pending_enrichment: cPending,
        enrichment_failed: cFailed,
        enrichment_error: cError,
        followed: cFollowed,
        follow_queue: followQueueRes.count ?? 0,
      },
      targetsError:
        followQueueRes.error?.message ||
        (cEnriched === null ? 'count_failed' : null),
    };
  } catch (e) {
    return {
      ...empty,
      error: e.message || String(e),
    };
  }
}

function buildStatusPayload(dashboard) {
  const base = orchestrator
    ? {
        status: orchestrator.status,
        running: orchestrator.running,
        dryRun: orchestrator.dryRun,
        dailyPlan: orchestrator.timing.dailyPlan,
        currentSession: orchestrator.timing.currentSession,
      }
    : {
        status: 'idle',
        running: false,
        dryRun: config.dryRun,
        dailyPlan: null,
        currentSession: null,
      };

  const live = orchestrator && orchestrator.running;
  const commentsToday = live
    ? orchestrator.timing.dailyPlan?.totalComments ?? 0
    : dashboard.dailyStats?.total_comments ?? dashboard.todaySessions?.comments_made ?? 0;

  const postsScannedToday = live
    ? orchestrator.timing.currentSession?.postsScanned ?? 0
    : dashboard.todaySessions?.posts_scanned ??
      dashboard.dailyStats?.total_posts_scanned ??
      0;

  const postsSkippedToday = live
    ? orchestrator.timing.currentSession?.postsSkipped ?? 0
    : dashboard.todaySessions?.posts_skipped ??
      dashboard.dailyStats?.total_posts_skipped ??
      0;

  return {
    ...base,
    dashboardTimezone,
    dashboardDateKey: dashboard.dateKey,
    commentsToday,
    postsScannedToday,
    postsSkippedToday,
    followerRunning: !!follower,
    followerLastResult,
    followerLive: follower?.live ?? null,
    dashboard,
  };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1080,
    height: 820,
    minWidth: 880,
    minHeight: 640,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadFile('renderer/index.html');
}

ipcMain.handle('automation:start', async () => {
  if (follower) {
    return { status: 'blocked', reason: 'follower_running' };
  }
  if (orchestrator) {
    return { status: 'already_running' };
  }

  orchestrator = new Orchestrator(config);
  await orchestrator.init();
  orchestrator.run();
  return { status: 'started' };
});

ipcMain.handle('automation:stop', async () => {
  if (orchestrator) {
    await orchestrator.cleanup();
    orchestrator = null;
  }
  return { status: 'stopped' };
});

ipcMain.handle('automation:status', async () => {
  const dashboard = await fetchDashboardData();
  return buildStatusPayload(dashboard);
});

ipcMain.handle('follower:start', async (_evt, options = {}) => {
  if (orchestrator) {
    return { status: 'blocked', reason: 'orchestrator_running' };
  }
  if (follower) {
    return { status: 'already_running' };
  }

  follower = new CompanyFollower(config);
  followerLastResult = null;
  try {
    await follower.init();
  } catch (err) {
    follower = null;
    return { status: 'error', message: err.message || String(err) };
  }
  follower
    .run(options)
    .then((res) => {
      followerLastResult = res;
    })
    .catch((err) => {
      followerLastResult = { error: err.message || String(err) };
    })
    .finally(async () => {
      if (follower) {
        await follower.cleanup();
        follower = null;
      }
    });

  return { status: 'started' };
});

ipcMain.handle('follower:stop', async () => {
  if (follower) {
    follower.stop();
    await follower.cleanup();
    follower = null;
  }
  return { status: 'stopped' };
});

ipcMain.handle('follower:status', async () => ({
  running: !!(follower && follower.running),
  lastResult: followerLastResult,
  live: follower?.live ?? null,
}));

ipcMain.handle('follower:stats', async () => {
  const dashboard = await fetchDashboardData();
  return {
    running: !!(follower && follower.running),
    lastResult: followerLastResult,
    live: follower?.live ?? null,
    targets: dashboard.targets,
    dateKey: dashboard.dateKey,
  };
});

app.whenReady().then(createWindow);

app.on('window-all-closed', async () => {
  if (orchestrator) await orchestrator.cleanup();
  orchestrator = null;
  if (follower) {
    follower.stop();
    await follower.cleanup();
    follower = null;
  }
  app.quit();
});
