/**
 * Run the Company Follower
 * 
 * Usage: 
 *   node run-follower.js                     # Follow up to 20 companies
 *   node run-follower.js --max 5             # Follow up to 5 companies
 *   node run-follower.js --dry-run           # Dry run (don't update Supabase)
 */

require('dotenv').config();
const CompanyFollower = require('./follower');
const config = require('./schmoozzer.json');

config.supabaseUrl = process.env.SUPABASE_URL || config.supabaseUrl;
config.supabaseKey = process.env.SUPABASE_KEY || config.supabaseKey;

const args = process.argv.slice(2);
const maxIndex = args.indexOf('--max');
const maxFollows = maxIndex !== -1 ? parseInt(args[maxIndex + 1], 10) : 20;
const dryRun = args.includes('--dry-run');

(async () => {
  console.log('=== COMPANY FOLLOWER ===\n');
  console.log(`Max follows: ${maxFollows}`);
  console.log(`Dry run: ${dryRun}\n`);

  const follower = new CompanyFollower(config);

  process.on('SIGINT', async () => {
    console.log('\nStopping follower...');
    await follower.cleanup();
    process.exit(0);
  });

  try {
    await follower.init();
    const result = await follower.run({ maxFollows, dryRun });
    console.log('\n=== RESULTS ===');
    console.log(`Followed: ${result.followed}`);
    console.log(`Skipped: ${result.skipped}`);
  } catch (err) {
    console.error('Follower error:', err);
  } finally {
    await follower.cleanup();
  }
})();
