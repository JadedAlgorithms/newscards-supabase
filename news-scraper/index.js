const Parser = require('rss-parser');
const { createClient } = require('@supabase/supabase-js');
const cheerio = require('cheerio');
const sanitizeHtml = require('sanitize-html');
const Sentiment = require('sentiment');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Initialize NLP Modules
const sentiment = new Sentiment();

// Extensible Classifier structure
class CategoryClassifier {
  constructor() {
    // Simple heuristic keyword lists to start with.
    // Structured so a trained NaiveBayes model could be dropped in easily here later.
    this.keywords = {
      business: ['stock', 'market', 'economy', 'finance', 'bank', 'rupee', 'dollar', 'sensex', 'nifty', 'company', 'profit', 'investment', 'rbi', 'inflation'],
      tech: ['app', 'software', 'apple', 'google', 'microsoft', 'cyber', 'digital', 'startup', 'ai', 'hardware', 'smartphone', 'tech', 'technology'],
      science: ['space', 'isro', 'nasa', 'research', 'study', 'scientist', 'climate', 'moon', 'health', 'virus', 'biology', 'physics', 'cancer'],
      international: ['biden', 'war', 'global', 'un ', 'china', 'usa', 'europe', 'ukraine', 'gaza', 'putin', 'world', 'israel', 'russia'],
      sports: ['cricket', 'football', 'tennis', 'olympics', 'bcci', 'ipl', 'match', 'tournament', 'world cup', 'kohli', 'dhoni', 'messi', 'sport'],
      national: ['india', 'delhi', 'mumbai', 'modi', 'parliament', 'congress', 'bjp', 'supreme court', 'states']
    };
  }

  predict(text, defaultCategory = 'national') {
    const lowerText = text.toLowerCase();
    let bestScore = 0;
    let bestCategory = null;

    for (const [category, words] of Object.entries(this.keywords)) {
      let score = words.reduce((acc, word) => {
        const regex = new RegExp(`\\b${word}\\b`, 'g');
        const matches = lowerText.match(regex);
        return acc + (matches ? matches.length : 0);
      }, 0);

      if (score > bestScore) {
        bestScore = score;
        bestCategory = category;
      }
    }

    if (bestScore > 0) {
      return bestCategory;
    }
    return defaultCategory;
  }
}

const classifier = new CategoryClassifier();

// Initialize Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = (supabaseUrl && supabaseServiceKey)
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

if (!supabase) {
  console.warn("No Supabase credentials found. Running in dry-run mode.");
}

const parser = new Parser();

const SOURCES = require('./sources.json');

async function scrapeFeed(source) {
  console.log(`Fetching ${source.name}...`);
  try {
    const feed = await parser.parseURL(source.url);
    const parsedArticles = [];

    for (const item of feed.items) {
      // 1. Clean HTML and source suffixes
      const rawHtml = item.contentSnippet || item.content || "";
      let description = sanitizeHtml(rawHtml, { allowedTags: [], allowedAttributes: {} }).trim();
      let title = (item.title || "").trim();

      const sourceSuffixRegex = /\s*[-–—]?\s*Reuters\s*$/i;
      title = title.replace(sourceSuffixRegex, '').trim();
      description = description.replace(sourceSuffixRegex, '').trim();

      const fullText = `${title} ${description}`;

      // 2. NLP Categorization
      const predictedCategory = classifier.predict(fullText, source.category);

      // 3. NLP Bias constraint
      const sentimentResult = sentiment.analyze(fullText);
      const biasScore = sentimentResult.score;

      // Filter out overly biased articles (extreme scores)
      if (Math.abs(biasScore) >= 15) {
        console.warn(`[Filtered] Extreme bias score (${biasScore}): ${title}`);
        continue;
      }

      // 4. Date Filter: Only current day's news (UTC-based for consistency with file naming)
      const todayStr = new Date().toISOString().split('T')[0];
      const pubDate = item.pubDate ? new Date(item.pubDate) : new Date();
      const pubDateStr = pubDate.toISOString().split('T')[0];

      if (pubDateStr < todayStr) {
        // Silent filter for old news
        continue;
      }

      parsedArticles.push({
        title,
        link: item.link,
        description,
        pubDate: pubDate.toISOString(),
        source: source.name.split(' - ')[0],
        category: predictedCategory,
        biasScore: biasScore
      });
    }
    return parsedArticles;
  } catch (error) {
    console.error(`Error scraping ${source.name}:`, error.message);
    return [];
  }
}

async function run() {
  console.log("--- News Scraping Job Started ---");
  const allArticles = [];

  for (const source of SOURCES) {
    const articles = await scrapeFeed(source);
    allArticles.push(...articles.slice(0, 20));
  }

  console.log(`Total categorized & cleaned articles to save: ${allArticles.length}`);

  try {
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir);
    }
    const today = new Date().toISOString().split('T')[0];
    const filePath = path.join(dataDir, `${today}.json`);
    fs.writeFileSync(filePath, JSON.stringify(allArticles, null, 2));
    console.log(`Saved a local copy to data/${today}.json`);
  } catch (err) {
    console.error("Failed to save data locally:", err);
  }

  if (supabase) {
    try {
      // Delete old articles beyond the 500 limit
      const { data: oldArticles } = await supabase
        .from('news')
        .select('id')
        .order('fetched_at', { ascending: false })
        .range(500, 99999);

      if (oldArticles && oldArticles.length > 0) {
        const idsToDelete = oldArticles.map(a => a.id);
        await supabase.from('news').delete().in('id', idsToDelete);
        console.log(`Deleted ${idsToDelete.length} older articles to maintain limit.`);
      }

      // Upsert new articles (link is UNIQUE, so duplicates are skipped)
      const toInsert = allArticles.map(a => ({
        title: a.title,
        link: a.link,
        description: a.description,
        pub_date: a.pubDate,
        source: a.source,
        category: a.category,
        bias_score: a.biasScore
      }));

      const { error } = await supabase
        .from('news')
        .upsert(toInsert, { onConflict: 'link', ignoreDuplicates: true });

      if (error) throw error;
      console.log(`Upserted ${toInsert.length} articles.`);
    } catch (error) {
      console.error("Error updating Supabase:", error);
    }
  } else {
    console.log("Dry run complete. No database connection.");
  }

  console.log("--- News Scraping Job Finished ---");
  process.exit(0);
}

run().catch(err => {
  console.error("Critical error:", err);
  process.exit(1);
});
