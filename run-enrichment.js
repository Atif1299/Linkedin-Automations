/**
 * Enrichment Pipeline
 * 
 * Takes companies from Supabase with status 'pending_enrichment'
 * and finds their LinkedIn company page, founder profile, and email
 * using Google search via Serper API.
 * 
 * Designed to run on Hetzner (via n8n or standalone cron).
 * Usage: node run-enrichment.js [--batch-size 50] [--delay 1200]
 */

const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const SERPER_API_KEY = process.env.SERPER_API_KEY;

// Parse CLI args (--batch-size / --delay, or positional batch delay for `npm run enrich -- 5 2000`)
const args = process.argv.slice(2);
let batchSize = parseInt(args.find((_, i) => args[i - 1] === '--batch-size') || '', 10);
let delayMs = parseInt(args.find((_, i) => args[i - 1] === '--delay') || '', 10);
const numericArgs = args.filter((a) => /^\d+$/.test(a)).map((a) => parseInt(a, 10));
if (!Number.isFinite(batchSize) || batchSize <= 0) {
  batchSize = Number.isFinite(numericArgs[0]) && numericArgs[0] > 0 ? numericArgs[0] : 50;
}
if (!Number.isFinite(delayMs) || delayMs <= 0) {
  delayMs = Number.isFinite(numericArgs[1]) && numericArgs[1] > 0 ? numericArgs[1] : 1200;
}

async function searchGoogle(query) {
  const response = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: {
      'X-API-KEY': SERPER_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ q: query, num: 5 }),
  });

  if (!response.ok) {
    throw new Error(`Serper API error: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

function extractLinkedInCompanyUrl(results) {
  if (!results.organic) return null;

  for (const result of results.organic) {
    const url = result.link || '';
    // Match linkedin.com/company/slug patterns
    const match = url.match(/linkedin\.com\/company\/([a-zA-Z0-9\-_]+)/);
    if (match) {
      return `https://www.linkedin.com/company/${match[1]}`;
    }
  }
  return null;
}

function extractFounderLinkedIn(results) {
  if (!results.organic) return { url: null, name: null };

  for (const result of results.organic) {
    const url = result.link || '';
    const match = url.match(/linkedin\.com\/in\/([a-zA-Z0-9\-_]+)/);
    if (match) {
      // Try to extract name from result title
      // Typical format: "John Smith - CEO - Company | LinkedIn"
      const title = result.title || '';
      const nameMatch = title.match(/^([^-|–]+)/);
      const name = nameMatch ? nameMatch[1].replace(/\s*\|\s*LinkedIn.*/, '').trim() : null;

      return {
        url: `https://www.linkedin.com/in/${match[1]}`,
        name: name,
      };
    }
  }
  return { url: null, name: null };
}

function extractEmail(results) {
  if (!results.organic) return null;

  // Look through snippets and titles for email patterns
  const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

  for (const result of results.organic) {
    const text = `${result.title || ''} ${result.snippet || ''}`;
    const emails = text.match(emailRegex);
    if (emails) {
      // Filter out common non-useful emails
      const useful = emails.filter(e =>
        !e.includes('example.com') &&
        !e.includes('noreply') &&
        !e.includes('no-reply') &&
        !e.includes('sentry') &&
        !e.endsWith('.png') &&
        !e.endsWith('.jpg')
      );
      if (useful.length > 0) return useful[0];
    }
  }
  return null;
}

async function enrichCompany(target) {
  const updates = {};
  let searchCount = 0;

  try {
    // 1. Find LinkedIn company page
    if (!target.linkedin_company) {
      const companyResults = await searchGoogle(
        `"${target.company_name}" site:linkedin.com/company`
      );
      searchCount++;
      updates.linkedin_company = extractLinkedInCompanyUrl(companyResults);
      await sleep(delayMs);
    }

    // 2. Find founder/CEO LinkedIn
    if (!target.founder_linkedin) {
      const founderQuery = target.domain
        ? `"${target.company_name}" ${target.domain} founder OR ceo OR owner site:linkedin.com/in`
        : `"${target.company_name}" founder OR ceo OR owner site:linkedin.com/in`;

      const founderResults = await searchGoogle(founderQuery);
      searchCount++;
      const founder = extractFounderLinkedIn(founderResults);
      updates.founder_linkedin = founder.url;
      updates.founder_name = founder.name;
      await sleep(delayMs);
    }

    // 3. Find email
    if (!target.email) {
      const emailQuery = target.domain
        ? `"${target.company_name}" ${target.domain} email contact`
        : `"${target.company_name}" contact email`;

      const emailResults = await searchGoogle(emailQuery);
      searchCount++;
      updates.email = extractEmail(emailResults);
      await sleep(delayMs);
    }

    // Determine status
    const hasLinkedIn = updates.linkedin_company || target.linkedin_company;
    updates.status = hasLinkedIn ? 'enriched' : 'enrichment_failed';
    updates.updated_at = new Date().toISOString();

    // Update Supabase
    const { error } = await supabase
      .from('targets')
      .update(updates)
      .eq('id', target.id);

    if (error) {
      console.error(`Failed to update ${target.company_name}:`, error.message);
    } else {
      const found = Object.entries(updates)
        .filter(([k, v]) => v && k !== 'status' && k !== 'updated_at')
        .map(([k]) => k)
        .join(', ');
      console.log(`✓ ${target.company_name} — found: ${found || 'nothing new'} (${searchCount} searches)`);
    }

  } catch (err) {
    console.error(`✗ ${target.company_name} — error: ${err.message}`);

    await supabase
      .from('targets')
      .update({ status: 'enrichment_error', updated_at: new Date().toISOString() })
      .eq('id', target.id);
  }

  return searchCount;
}

async function run() {
  console.log(`Starting enrichment (batch size: ${batchSize}, delay: ${delayMs}ms)`);

  // Fetch batch of pending companies
  const { data: targets, error } = await supabase
    .from('targets')
    .select('*')
    .eq('status', 'pending_enrichment')
    .limit(batchSize);

  if (error) {
    console.error('Failed to fetch targets:', error.message);
    return;
  }

  if (!targets || targets.length === 0) {
    console.log('No pending targets to enrich');
    return;
  }

  console.log(`Processing ${targets.length} companies...`);

  let totalSearches = 0;
  let enriched = 0;
  let failed = 0;

  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    console.log(`\n[${i + 1}/${targets.length}] ${target.company_name} (${target.domain})`);

    const searches = await enrichCompany(target);
    totalSearches += searches;

    // Check result
    const { data: updated } = await supabase
      .from('targets')
      .select('status')
      .eq('id', target.id)
      .single();

    if (updated?.status === 'enriched') enriched++;
    else failed++;
  }

  console.log(`\n--- Enrichment Complete ---`);
  console.log(`Processed: ${targets.length}`);
  console.log(`Enriched: ${enriched}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total API searches: ${totalSearches}`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

run().catch(console.error);
