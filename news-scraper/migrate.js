/**
 * Run the clustering migration against Supabase.
 * Creates the stories table and adds story_id to news.
 */
// Supabase + Node 18 workaround for WebSocket
global.WebSocket = require('ws');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  db: { schema: 'public' }
});

async function runMigration() {
  console.log('Running clustering migration...\n');

  // Test connection by querying news table
  const { data: testData, error: testError } = await supabase
    .from('news')
    .select('id')
    .limit(1);

  if (testError) {
    console.error('Cannot connect to Supabase:', testError.message);
    process.exit(1);
  }
  console.log('✓ Connected to Supabase');

  // Check if stories table exists by trying to query it
  const { error: storiesCheckError } = await supabase
    .from('stories')
    .select('id')
    .limit(1);

  if (storiesCheckError && storiesCheckError.code === '42P01') {
    console.log('\n⚠ The "stories" table does not exist yet.');
    console.log('Please run the following SQL in your Supabase SQL Editor:\n');
    console.log('─'.repeat(60));
    
    const fs = require('fs');
    const sql = fs.readFileSync(path.join(__dirname, 'migrations', '001_add_stories.sql'), 'utf8');
    console.log(sql);
    
    console.log('─'.repeat(60));
    console.log('\nGo to: https://supabase.com/dashboard/project/kkyaufhmykxknbqirmqz/sql/new');
    console.log('Paste the SQL above and click "Run".\n');
  } else if (storiesCheckError) {
    console.error('Error checking stories table:', storiesCheckError);
  } else {
    console.log('✓ Stories table already exists');
  }

  // Check if sensationalism columns exist on news table
  const { data: newsSensTest, error: newsSensTestError } = await supabase
    .from('news')
    .select('sensationalism_score')
    .limit(1);

  if (newsSensTestError && newsSensTestError.message.includes('sensationalism_score')) {
    console.log('\n⚠ The "sensationalism_score" column does not exist on the news table yet.');
    console.log('Please run the following SQL in your Supabase SQL Editor:\n');
    console.log('─'.repeat(60));
    
    const fs = require('fs');
    const sql = fs.readFileSync(path.join(__dirname, 'migrations', '002_add_sensationalism.sql'), 'utf8');
    console.log(sql);
    
    console.log('─'.repeat(60));
    console.log('\nGo to: https://supabase.com/dashboard/project/kkyaufhmykxknbqirmqz/sql/new');
    console.log('Paste the SQL above and click "Run".\n');
  } else if (newsSensTestError) {
    console.error('Error checking news table:', newsSensTestError);
  } else {
    console.log('✓ sensationalism_score column exists on news table');
  }

  // Check if political_lean_score column exists on news table
  const { data: newsLeanTest, error: newsLeanTestError } = await supabase
    .from('news')
    .select('political_lean_score')
    .limit(1);

  if (newsLeanTestError && newsLeanTestError.message.includes('political_lean_score')) {
    console.log('\n⚠ The "political_lean_score" column does not exist on the news table yet.');
    console.log('Please run the following SQL in your Supabase SQL Editor:\n');
    console.log('─'.repeat(60));
    
    const fs = require('fs');
    const sql = fs.readFileSync(path.join(__dirname, 'migrations', '003_add_political_lean.sql'), 'utf8');
    console.log(sql);
    
    console.log('─'.repeat(60));
    console.log('\nGo to: https://supabase.com/dashboard/project/kkyaufhmykxknbqirmqz/sql/new');
    console.log('Paste the SQL above and click "Run".\n');
  } else if (newsLeanTestError) {
    console.error('Error checking news table:', newsLeanTestError);
  } else {
    console.log('✓ political_lean_score column exists on news table');
  }

  // Check if story_id column exists on news table
  const { data: newsTest, error: newsTestError } = await supabase
    .from('news')
    .select('story_id')
    .limit(1);

  if (newsTestError && newsTestError.message.includes('story_id')) {
    console.log('⚠ The "story_id" column does not exist on the news table yet.');
    console.log('  This will be created by the migration SQL above.');
  } else if (!newsTestError) {
    console.log('✓ story_id column exists on news table');
  }

  console.log('\nMigration check complete.');
}

runMigration().catch(err => {
  console.error('Migration error:', err);
  process.exit(1);
});
