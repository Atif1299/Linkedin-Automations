const $ = (id) => document.getElementById(id);

const logEl = $('activity-log');
const statusPanel = $('status-panel');
const statusHeadline = $('status-headline');
const statusSub = $('status-sub');
const statusElapsed = $('status-elapsed');
const progressWrap = $('progress-wrap');
const progressCounts = $('progress-counts');
const progressBar = $('progress-bar');
const progressFill = $('progress-fill');
const statusSession = $('status-session');
const statusFollower = $('status-follower');
const lastPollEl = $('last-poll');
const cmdHint = $('cmd-hint');

const MAX_LOG = 80;
let runStartedAt = null;

const STATE_HELP = {
  running: 'Scanning the feed and evaluating posts for comments.',
  break: 'Between sessions — pause before the next burst.',
  waiting: 'Outside operating hours — resumes inside your window.',
  stopped: 'Engine stopped.',
};

const FOLLOW_PHASE = {
  fetching: 'Loading queue…',
  following: 'On company page.',
  cooldown: 'Rate-limit pause before next.',
  done: 'Finishing…',
};

function getTz(s) {
  return s.dashboardTimezone || s.dashboard?.dashboardTimezone || 'Europe/London';
}

function formatTime(iso, tz) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, dateStyle: 'short', timeStyle: 'medium' }).format(d);
}

function formatPostId(id) {
  if (id == null || id === '') return '—';
  const t = String(id);
  return t.length <= 22 ? t : `${t.slice(0, 10)}…${t.slice(-8)}`;
}

function tagClass(st) {
  const n = String(st || '').toLowerCase();
  if (n === 'posted') return 'tag tag-posted';
  if (n === 'dry_run') return 'tag tag-dry_run';
  return 'tag';
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatSession(sess, plan) {
  if (!sess) return '—';
  const bits = [
    `${sess.commentsCompleted ?? 0}/${sess.commentTarget ?? '—'} comments`,
    `${sess.postsScanned ?? 0} scanned`,
    `${sess.postsSkipped ?? 0} skipped`,
  ];
  if (plan?.date) bits.push(`plan ${plan.date}`);
  return bits.join(' · ');
}

function formatPlan(plan) {
  if (!plan) return '—';
  return `${plan.totalComments ?? 0} comments · ${plan.sessionsCompleted ?? 0} sessions`;
}

function formatElapsed(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m <= 0 ? `${s}s` : `${m}m ${String(s).padStart(2, '0')}s`;
}

function syncRunStart(orch, fol) {
  const on = orch || fol;
  if (on && runStartedAt == null) runStartedAt = Date.now();
  if (!on) runStartedAt = null;
}

function appendLog(line) {
  const ts = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const next = `${logEl.textContent}\n[${ts}] ${line}`.trim().split('\n').slice(-MAX_LOG).join('\n');
  logEl.textContent = next;
  logEl.scrollTop = logEl.scrollHeight;
}

function setText(id, v) {
  const n = $(id);
  if (n) n.textContent = v == null || v === '' ? '—' : String(v);
}

function applyStatus(s) {
  const tz = getTz(s);
  const d = s.dashboard || {};
  const t = d.targets || {};
  const orch = !!s.running;
  const fol = !!s.followerRunning;
  const st = String(s.status || 'idle').toLowerCase();

  $('header-date').textContent = s.dashboardDateKey ? `Today ${s.dashboardDateKey}` : '—';

  syncRunStart(orch, fol);
  if (runStartedAt != null) {
    statusElapsed.textContent = `Running ${formatElapsed(Math.floor((Date.now() - runStartedAt) / 1000))}`;
  } else {
    statusElapsed.textContent = '';
  }

  statusPanel.className = 'panel status';
  if (orch || fol) {
    if (orch && st === 'waiting') statusPanel.classList.add('tone-wait');
    else if (orch && st === 'break') statusPanel.classList.add('tone-break');
    else if (orch && st === 'stopped') statusPanel.classList.add('tone-stop');
    else statusPanel.classList.add('tone-run');
  } else if (st === 'waiting') statusPanel.classList.add('tone-wait');
  else if (st === 'break') statusPanel.classList.add('tone-break');
  else if (st === 'stopped') statusPanel.classList.add('tone-stop');
  else statusPanel.classList.add('tone-idle');

  if (!orch && !fol) {
    statusHeadline.textContent =
      st === 'idle'
        ? 'Idle — ready when you are'
        : `Ready (${st})`;
    let sub = 'Use the buttons above to start comment automation or company follows.';
    if (d.error === 'supabase_not_configured') sub += ' Supabase not configured; stats limited.';
    statusSub.textContent = sub;
    progressWrap.hidden = true;
    statusSession.hidden = true;
    statusFollower.hidden = true;
  } else {
    const parts = [];
    if (orch) parts.push(`Comments: ${st}`);
    if (fol) parts.push('Follows: active');
    statusHeadline.textContent = parts.join(' · ');
    if (orch && fol) {
      statusSub.textContent = `${STATE_HELP[st] || 'Comments active.'} Follow run in parallel.`;
    } else if (orch) {
      statusSub.textContent = STATE_HELP[st] || 'Comment automation active.';
    } else {
      statusSub.textContent = 'Company follow automation active.';
    }

    const sess = s.currentSession;
    if (orch && sess?.commentTarget > 0) {
      const done = Math.min(sess.commentsCompleted ?? 0, sess.commentTarget);
      const pct = Math.min(100, Math.round((done / sess.commentTarget) * 100));
      progressWrap.hidden = false;
      progressCounts.textContent = `${done} / ${sess.commentTarget}`;
      progressFill.style.width = `${pct}%`;
      progressBar.setAttribute('aria-valuenow', String(pct));
      progressBar.setAttribute('aria-valuetext', `${done} of ${sess.commentTarget}`);
    } else {
      progressWrap.hidden = true;
    }

    if (orch && sess) {
      statusSession.hidden = false;
      statusSession.textContent = `This session: ${sess.postsScanned ?? 0} scanned · ${sess.postsSkipped ?? 0} skipped`;
    } else {
      statusSession.hidden = true;
    }

    const fl = s.followerLive;
    if (fol && fl && fl.phase !== 'done') {
      statusFollower.hidden = false;
      const ph = FOLLOW_PHASE[fl.phase] || fl.phase;
      const idx = fl.total > 0 ? `${fl.index}/${fl.total}` : '—';
      statusFollower.textContent = `Follows: ${fl.companyName || '—'} (${idx}) · ${ph}`;
    } else if (fol && !fl) {
      statusFollower.hidden = false;
      statusFollower.textContent = 'Follow run active…';
    } else {
      statusFollower.hidden = true;
      statusFollower.textContent = '';
    }
  }

  lastPollEl.textContent = `Last poll ${new Intl.DateTimeFormat('en-GB', { timeStyle: 'medium' }).format(new Date())}`;

  setText('m-comments', s.commentsToday);
  setText('m-scanned', s.postsScannedToday);
  setText('m-skipped', s.postsSkippedToday);
  const sessToday =
    s.running && s.dailyPlan ? s.dailyPlan.sessionsCompleted : d.dailyStats?.sessions_completed;
  setText('m-sessions', sessToday);

  $('kv-dry').textContent = s.dryRun === true ? 'Yes' : s.dryRun === false ? 'No' : '—';
  $('kv-state').textContent = s.status ?? '—';
  $('kv-session').textContent = formatSession(s.currentSession, s.dailyPlan);
  $('kv-plan').textContent = formatPlan(s.dailyPlan);
  setText('kv-fq', t.follow_queue);
  setText('kv-fd', t.followed);
  if (s.followerLastResult?.error) {
    $('kv-fl').textContent = `Error: ${s.followerLastResult.error}`;
  } else if (s.followerLastResult) {
    const r = s.followerLastResult;
    $('kv-fl').textContent = `+${r.followed ?? 0} / skip ${r.skipped ?? 0}`;
  } else {
    $('kv-fl').textContent = '—';
  }

  setText('en-rich', t.enriched);
  setText('en-pend', t.pending_enrichment);
  setText('en-fail', t.enrichment_failed);
  setText('en-err', t.enrichment_error);

  const tb = $('comment-tbody');
  tb.textContent = '';
  const rows = d.recentComments || [];
  if (!rows.length) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="4" class="muted">No comments yet</td>';
    tb.appendChild(tr);
  } else {
    for (const row of rows) {
      const ts = row.posted_at || row.generated_at;
      const snip = (row.post_content_snippet || row.comment_text || '').trim();
      const prev = snip.length > 100 ? `${snip.slice(0, 97)}…` : snip;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${formatTime(ts, tz)}</td>
        <td class="cell-mono">${escapeHtml(formatPostId(row.post_id))}</td>
        <td><span class="${tagClass(row.status)}">${escapeHtml(row.status || '—')}</span></td>
        <td>${escapeHtml(prev || '—')}</td>`;
      tb.appendChild(tr);
    }
  }

  $('btn-start').disabled = orch || fol;
  $('btn-stop').disabled = !orch;
  $('btn-follow-start').disabled = orch || fol;
  $('btn-follow-stop').disabled = !fol;
  cmdHint.textContent = fol
    ? 'Follow run in progress — comments disabled.'
    : orch
      ? 'Comments running — follows disabled.'
      : '';
}

async function refreshStatus() {
  if (!window.automation) {
    statusHeadline.textContent = 'Automation API unavailable';
    return;
  }
  try {
    applyStatus(await window.automation.status());
  } catch (e) {
    appendLog(`status: ${e.message || e}`);
  }
}

appendLog('Dashboard ready (poll every 3s).');

$('btn-start').onclick = async () => {
  appendLog('Start comments');
  try {
    const res = await window.automation.start();
    appendLog(JSON.stringify(res));
    if (res.status === 'blocked' && res.reason === 'follower_running') appendLog('Blocked: stop follows first.');
  } catch (e) {
    appendLog(String(e.message || e));
  }
  refreshStatus();
};

$('btn-stop').onclick = async () => {
  appendLog('Stop comments');
  try {
    appendLog(JSON.stringify(await window.automation.stop()));
  } catch (e) {
    appendLog(String(e.message || e));
  }
  refreshStatus();
};

$('btn-follow-start').onclick = async () => {
  appendLog('Start follows');
  if (!window.follower) {
    appendLog('No follower API');
    return;
  }
  try {
    const res = await window.follower.start({ maxFollows: 20, dryRun: false });
    appendLog(JSON.stringify(res));
    if (res.status === 'blocked' && res.reason === 'orchestrator_running') appendLog('Blocked: stop comments first.');
  } catch (e) {
    appendLog(String(e.message || e));
  }
  refreshStatus();
};

$('btn-follow-stop').onclick = async () => {
  appendLog('Stop follows');
  try {
    if (window.follower) appendLog(JSON.stringify(await window.follower.stop()));
  } catch (e) {
    appendLog(String(e.message || e));
  }
  refreshStatus();
};

refreshStatus();
setInterval(refreshStatus, 3000);
