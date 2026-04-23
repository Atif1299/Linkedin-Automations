/**
 * Seed exclusion keywords into Supabase
 * 
 * Usage: node seed-exclusion-keywords.js
 */

const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const KEYWORDS = [
  // Political
  { keyword: 'trump', category: 'political' },
  { keyword: 'biden', category: 'political' },
  { keyword: 'harris', category: 'political' },
  { keyword: 'politics', category: 'political' },
  { keyword: 'political', category: 'political' },
  { keyword: 'election', category: 'political' },
  { keyword: 'vote', category: 'political' },
  { keyword: 'voting', category: 'political' },
  { keyword: 'democrat', category: 'political' },
  { keyword: 'republican', category: 'political' },
  { keyword: 'liberal', category: 'political' },
  { keyword: 'conservative', category: 'political' },
  { keyword: 'maga', category: 'political' },
  { keyword: 'congress', category: 'political' },
  { keyword: 'senate', category: 'political' },

  // Geopolitical / conflict
  { keyword: 'israel', category: 'sensitive' },
  { keyword: 'palestine', category: 'sensitive' },
  { keyword: 'gaza', category: 'sensitive' },
  { keyword: 'hamas', category: 'sensitive' },
  { keyword: 'hormuz', category: 'sensitive' },
  { keyword: 'iran', category: 'sensitive' },
  { keyword: 'war', category: 'sensitive' },
  { keyword: 'military', category: 'sensitive' },
  { keyword: 'conflict', category: 'sensitive' },
  { keyword: 'ukraine', category: 'sensitive' },
  { keyword: 'russia', category: 'sensitive' },
  { keyword: 'sanctions', category: 'sensitive' },
  { keyword: 'tariff', category: 'sensitive' },
  { keyword: 'tariffs', category: 'sensitive' },

  // Social issues
  { keyword: 'abortion', category: 'sensitive' },
  { keyword: 'gun control', category: 'sensitive' },
  { keyword: 'immigration', category: 'sensitive' },
  { keyword: 'refugee', category: 'sensitive' },
  { keyword: 'protest', category: 'sensitive' },
  { keyword: 'racism', category: 'sensitive' },
  { keyword: 'discrimination', category: 'sensitive' },

  // Job posts
  { keyword: 'we\'re hiring', category: 'job_post' },
  { keyword: 'we are hiring', category: 'job_post' },
  { keyword: 'job opening', category: 'job_post' },
  { keyword: 'job alert', category: 'job_post' },
  { keyword: 'apply now', category: 'job_post' },
  { keyword: 'join our team', category: 'job_post' },
  { keyword: 'open position', category: 'job_post' },
  { keyword: 'now hiring', category: 'job_post' },
  { keyword: 'job opportunity', category: 'job_post' },

  // Death / mourning
  { keyword: 'rip', category: 'sensitive' },
  { keyword: 'passed away', category: 'sensitive' },
  { keyword: 'funeral', category: 'sensitive' },
  { keyword: 'condolences', category: 'sensitive' },
  { keyword: 'thoughts and prayers', category: 'sensitive' },
  { keyword: 'in memoriam', category: 'sensitive' },
  { keyword: 'rest in peace', category: 'sensitive' },

  // Legal
  { keyword: 'lawsuit', category: 'sensitive' },
  { keyword: 'sued', category: 'sensitive' },
  { keyword: 'legal action', category: 'sensitive' },
  { keyword: 'indictment', category: 'sensitive' },
  { keyword: 'class action', category: 'sensitive' },

  // Religion
  { keyword: 'praise god', category: 'sensitive' },
  { keyword: 'blessed', category: 'sensitive' },
  { keyword: 'prayer', category: 'sensitive' },
];

async function seed() {
  console.log(`Seeding ${KEYWORDS.length} exclusion keywords...`);

  const { error } = await supabase
    .from('exclusion_keywords')
    .upsert(KEYWORDS, { onConflict: 'keyword' });

  if (error) {
    console.error('Seed error:', error.message);
  } else {
    console.log(`Done. ${KEYWORDS.length} keywords seeded.`);
  }
}

seed().catch(console.error);
