/**
 * Copy ANTHROPIC_* from project root .env into comment-api/.env (no secrets printed).
 * Usage: node sync-comment-api-env.js
 */

const fs = require('fs');
const path = require('path');

const rootEnv = path.join(__dirname, '.env');
const outPath = path.join(__dirname, 'comment-api', '.env');

if (!fs.existsSync(rootEnv)) {
  console.error('Missing .env in project root');
  process.exit(1);
}

const text = fs.readFileSync(rootEnv, 'utf8');
const vars = new Map();
for (const line of text.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eq = trimmed.indexOf('=');
  if (eq === -1) continue;
  const k = trimmed.slice(0, eq).trim();
  const v = trimmed.slice(eq + 1).trim();
  vars.set(k, v);
}

const key = vars.get('ANTHROPIC_API_KEY');
if (!key) {
  console.error('ANTHROPIC_API_KEY not found in root .env');
  process.exit(1);
}

const model = vars.get('ANTHROPIC_MODEL') || 'claude-sonnet-4-20250514';
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `ANTHROPIC_API_KEY=${key}\nANTHROPIC_MODEL=${model}\n`);
console.log('comment-api/.env updated from root .env');
