/**
 * Import targets from the cleaned CSV into Supabase
 * 
 * Usage: node import-targets.js [path/to/schmoozzer_targets.csv]
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function importTargets(csvPath) {
  const content = fs.readFileSync(csvPath, 'utf-8');
  const lines = content.trim().split('\n');
  const headers = lines[0].split(',');

  console.log(`Found ${lines.length - 1} rows to import`);

  const batch = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    const row = {};
    headers.forEach((h, idx) => { row[h.trim()] = values[idx]?.trim() || null; });

    batch.push({
      domain: row.domain,
      company_name: row.company_name,
      industry: row.industry || null,
      city: row.city || null,
      state: row.state || null,
      country: row.country || null,
      twitter: row.twitter || null,
      instagram: row.instagram || null,
      social_followers: row.social_followers || null,
      employee_count: row.employee_count || null,
      linkedin_company: row.linkedin_company || null,
      founder_linkedin: row.founder_linkedin || null,
      founder_name: row.founder_name || null,
      email: row.email || null,
      followed: false,
      status: 'pending_enrichment',
    });

    // Insert in batches of 100
    if (batch.length >= 100) {
      const { error } = await supabase.from('targets').insert(batch);
      if (error) console.error(`Batch insert error at row ${i}:`, error.message);
      else console.log(`Inserted rows ${i - 99}-${i}`);
      batch.length = 0;
    }
  }

  // Insert remaining
  if (batch.length > 0) {
    const { error } = await supabase.from('targets').insert(batch);
    if (error) console.error('Final batch error:', error.message);
    else console.log(`Inserted final ${batch.length} rows`);
  }

  console.log('Import complete');
}

const csvFile = process.argv[2] || path.join(__dirname, 'schmoozzer_targets.csv');
importTargets(csvFile).catch(console.error);
