/**
 * Verifies env and remote checks for the Electron readiness plan (no secrets printed).
 * Usage: node readiness-check.js
 */

const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '.env') });

const envOnly = process.argv.includes('--env-only');

function fail(msg) {
  console.error('FAIL:', msg);
  process.exit(1);
}

function ok(msg) {
  console.log('OK:', msg);
}

async function main() {
  const u = (process.env.SUPABASE_URL || '').trim();
  const k = (process.env.SUPABASE_KEY || '').trim();
  if (!u || !k) fail('SUPABASE_URL or SUPABASE_KEY missing in .env');
  if (/your-project\.supabase\.co|placeholder/i.test(u)) fail('SUPABASE_URL still looks like a placeholder');
  if (/your-anon-key|^YOUR_/i.test(k) || k.length < 20) fail('SUPABASE_KEY still looks like a placeholder');
  ok('Root .env has Supabase URL and key');

  const must = ['renderer/index.html', 'preload.js', 'main.js', 'orchestrator.js', 'schmoozzer.json'];
  for (const f of must) {
    if (!fs.existsSync(path.join(__dirname, f))) fail(`Missing file: ${f}`);
  }
  ok('Electron dashboard and entry files exist');

  if (envOnly) {
    console.log('Env-only mode: skipping Supabase and comment API checks.');
    return;
  }

  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(u, k);
  const { count: kwCount, error: kwErr } = await supabase
    .from('exclusion_keywords')
    .select('*', { count: 'exact', head: true });
  if (kwErr) fail(`Supabase exclusion_keywords: ${kwErr.message}`);
  if (!kwCount || kwCount < 1) fail('exclusion_keywords table empty — run npm run seed-keywords');
  ok(`Supabase exclusion_keywords count: ${kwCount}`);

  const { count: tCount, error: tErr } = await supabase
    .from('targets')
    .select('*', { count: 'exact', head: true });
  if (tErr) fail(`Supabase targets: ${tErr.message}`);
  if (!tCount || tCount < 1) fail('targets table empty — run npm run import-targets');
  ok(`Supabase targets count: ${tCount}`);

  const commentUrl = (process.env.COMMENT_API_URL || '').trim();
  if (!commentUrl) fail('COMMENT_API_URL missing in .env');
  ok('COMMENT_API_URL is set');

  let healthUrl;
  try {
    const parsed = new URL(commentUrl);
    parsed.pathname = '/health';
    healthUrl = parsed.toString();
  } catch {
    healthUrl = String(commentUrl).replace(/\/?generate-comment\/?$/i, '') + '/health';
  }
  try {
    const r = await fetch(healthUrl);
    if (!r.ok) fail(`Comment API health HTTP ${r.status}`);
    ok('Comment API /health reachable');
  } catch (e) {
    fail(`Comment API unreachable: ${e.message}. Run: npm run comment-api`);
  }

  const dry = String(process.env.AUTOMATION_DRY_RUN || '').toLowerCase();
  console.log(
    'Dry run: AUTOMATION_DRY_RUN=',
    dry || '(unset)',
    '— use true for Phase 5-style runs (no LinkedIn submit), false for live posting.'
  );

  console.log('All automated readiness checks passed.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
