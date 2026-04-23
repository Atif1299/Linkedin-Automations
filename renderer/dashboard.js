const logEl = document.getElementById('activity-log');
const btnStart = document.getElementById('btn-start');
const btnStop = document.getElementById('btn-stop');
const statusState = document.getElementById('status-state');
const statusRunning = document.getElementById('status-running');
const statusDryRun = document.getElementById('status-dry-run');
const statusCommentsToday = document.getElementById('status-comments-today');
const statusSession = document.getElementById('status-session');

const MAX_LOG_LINES = 80;
let pollTimer = null;

function appendLog(line) {
  const ts = new Date().toISOString().slice(11, 19);
  const next = `${logEl.textContent}\n[${ts}] ${line}`.trim();
  const lines = next.split('\n');
  logEl.textContent = lines.slice(-MAX_LOG_LINES).join('\n');
}

function formatSession(currentSession, dailyPlan) {
  if (!currentSession) return '—';
  const parts = [
    `${currentSession.commentsCompleted ?? 0} / ${currentSession.commentTarget ?? '—'} comments`,
    `scanned ${currentSession.postsScanned ?? 0}`,
    `skipped ${currentSession.postsSkipped ?? 0}`,
  ];
  if (dailyPlan?.date) parts.push(`plan ${dailyPlan.date}`);
  return parts.join(' · ');
}

async function refreshStatus() {
  if (!window.automation) {
    statusState.textContent = 'automation API unavailable';
    return;
  }
  try {
    const s = await window.automation.status();
    statusState.textContent = s.status ?? '—';
    statusRunning.textContent = s.running ? 'yes' : 'no';
    statusDryRun.textContent =
      s.dryRun === true ? 'yes' : s.dryRun === false ? 'no' : '—';
    const total = s.dailyPlan?.totalComments;
    statusCommentsToday.textContent = typeof total === 'number' ? String(total) : '—';
    statusSession.textContent = formatSession(s.currentSession, s.dailyPlan);

    btnStart.disabled = !!s.running;
    btnStop.disabled = !s.running;

    if (s.running && !pollTimer) {
      pollTimer = setInterval(refreshStatus, 2000);
    }
    if (!s.running && pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  } catch (err) {
    appendLog(`status error: ${err.message || err}`);
  }
}

btnStart.addEventListener('click', async () => {
  appendLog('Start requested');
  try {
    const res = await window.automation.start();
    appendLog(`start: ${JSON.stringify(res)}`);
  } catch (err) {
    appendLog(`start error: ${err.message || err}`);
  }
  await refreshStatus();
});

btnStop.addEventListener('click', async () => {
  appendLog('Stop requested');
  try {
    const res = await window.automation.stop();
    appendLog(`stop: ${JSON.stringify(res)}`);
  } catch (err) {
    appendLog(`stop error: ${err.message || err}`);
  }
  await refreshStatus();
});

refreshStatus();
setInterval(refreshStatus, 5000);
