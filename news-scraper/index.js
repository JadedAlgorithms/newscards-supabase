const Parser = require('rss-parser');
// Supabase + Node 18 workaround for WebSocket
global.WebSocket = require('ws');
const { createClient } = require('@supabase/supabase-js');
const cheerio = require('cheerio');
const sanitizeHtml = require('sanitize-html');
const fs = require('fs');
const path = require('path');
const { clusterArticles } = require('./cluster');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Source Bias Mapping (Approximate, based on Media Bias Charts)
// Negative = Left-leaning, Positive = Right-leaning, 0 = Center
const SOURCE_BIAS = {
  "Reuters": 0,
  "AP News": 0,
  "BBC": -1,
  "The Guardian": -3,
  "NPR": -2,
  "Al Jazeera": -2,
  "Indian Express": -1,
  "The Hindu": -2,
  "NDTV": -1,
  "Times of India": 0,
  "Hindustan Times": 0,
  "Mint": 0,
  "CNBC": 0,
  "MarketWatch": 0,
  "Zee News": 1.5,
  "Republic TV": 2,
  "TechCrunch": -1,
  "Ars Technica": -1,
  "The Verge": -1,
  "Wired": -1,
  "Hacker News": 0,
  "ScienceDaily": 0,
  "Nature": 0,
  "NASA": 0,
  "New Scientist": 0,
  "ESPN": 0,
  "Variety": -1,
  "Hollywood Reporter": -1,
  "Politico": -1,
  "The Hill": 0,
  "Fox News": 2,
  "New York Post": 1.5,
  "The Telegraph": 2,
  "Washington Times": 2.5
};

function getSourceBias(sourceName) {
  for (const [key, score] of Object.entries(SOURCE_BIAS)) {
    if (sourceName.includes(key)) {
      return score;
    }
  }
  return 0; // Default to center
}

// Political Lean Detection (source-heavy approach)
// Only the most unambiguous domestic political framing keywords.
// Each entry: [phrase, lean_nudge]. Negative = left nudge, positive = right nudge.
const FRAMING_KEYWORDS = [
  // Immigration framing
  ['illegal aliens', 0.8],
  ['illegal immigrants', 0.5],
  ['undocumented workers', -0.5],
  ['undocumented immigrants', -0.3],
  // Economic framing
  ['job creators', 0.5],
  ['tax burden', 0.4],
  ['wealth inequality', -0.5],
  ['corporate greed', -0.6],
  ['trickle down', -0.4],
  ['free market', 0.4],
  // Social policy framing
  ['pro-life', 0.5],
  ['pro-choice', -0.5],
  ['gun rights', 0.5],
  ['gun violence', -0.4],
  ['gun control', -0.3],
  ['second amendment', 0.4],
  ['religious freedom', 0.4],
  // Governance framing
  ['big government', 0.5],
  ['government overreach', 0.5],
  ['social safety net', -0.4],
  ['entitlement reform', 0.4],
  ['welfare state', 0.4],
  // Climate framing
  ['climate crisis', -0.5],
  ['climate alarmist', 0.5],
  ['energy independence', 0.3],
  ['green new deal', -0.5],
  // Trump & MAGA framing
  ['make america great again', 0.8],
  ['maga', 0.6],
  ['trump administration success', 0.6],
  ['witch hunt', 0.5],
  ['fake news media', 0.6],
  // Indian Govt / Modi framing
  ['modi government success', 0.6],
  ['historic decision by modi', 0.6],
  ['vishwaguru', 0.5],
  ['new india', 0.4],
  ['sabka saath sabka vikas', 0.6],
  ['surgical strike', 0.5],
  ['masterstroke', 0.5],
  ['bjp', 0.6]
];

// Categories where political lean is not meaningful
const NON_POLITICAL_CATEGORIES = new Set(['tech', 'science', 'sports', 'entertainment']);

/**
 * Detect political lean of an article.
 * Returns { score, label } or null if category is non-political.
 * 
 * Source bias is the primary signal (weight: 1.0).
 * Keyword framing is a secondary nudge (capped at ±1.0).
 */
function detectPoliticalLean(title, description, sourceBiasScore, category) {
  if (NON_POLITICAL_CATEGORIES.has(category)) {
    return null;
  }

  const fullText = `${title} ${description}`.toLowerCase();

  // Sum keyword nudges, capped at ±1.0
  let keywordNudge = 0;
  for (const [phrase, nudge] of FRAMING_KEYWORDS) {
    if (fullText.includes(phrase)) {
      keywordNudge += nudge;
    }
  }
  keywordNudge = Math.max(-1.0, Math.min(1.0, keywordNudge));

  // Combined score: source bias (dominant) + keyword nudge (minor)
  const combinedScore = sourceBiasScore + keywordNudge;
  // Round to 2 decimal places
  const score = Math.round(combinedScore * 100) / 100;

  let label = 'neutral';
  if (score <= -0.8) label = 'left-leaning';
  else if (score >= 0.8) label = 'right-leaning';

  return { score, label };
}

// Extensible Classifier structure
class CategoryClassifier {
  constructor() {
    // Simple heuristic keyword lists to start with.
    // Structured so a trained NaiveBayes model could be dropped in easily here later.
    this.keywords = {
      business: ['stock', 'market', 'economy', 'finance', 'bank', 'rupee', 'dollar', 'sensex', 'nifty', 'company', 'profit', 'investment', 'rbi', 'inflation', 'gdp', 'tax', 'stocks', 'markets', 'earnings', 'corporate'],
      tech: ['app', 'software', 'apple', 'google', 'microsoft', 'cyber', 'digital', 'startup', 'ai', 'hardware', 'smartphone', 'tech', 'technology', 'openai', 'meta', 'nvidia', 'cybersecurity', 'gadget', 'silicon'],
      science: ['space', 'isro', 'nasa', 'research', 'study', 'scientist', 'climate', 'moon', 'health', 'virus', 'biology', 'physics', 'cancer', 'dna', 'orbit', 'galaxy', 'medical', 'disease', 'vaccine', 'planet'],
      international: [
        // Global Leaders & Figures
        'biden', 'trump', 'putin', 'zelenskyy', 'netanyahu', 'macron', 'scholz', 'starmer', 'sunak', 'jinping',
        'harris', 'obama', 'meloni', 'erdogan', 'kishida', 'albanese', 'trudeau', 'lula', 'ramaphosa', 'guterres',
        // Major Nations & Territories
        'usa', 'uk', 'united states', 'china', 'russia', 'ukraine', 'israel', 'palestine', 'palestinian',
        'gaza', 'taiwan', 'pakistan', 'bangladesh', 'nepal', 'sri lanka', 'afghanistan', 'iran', 'iraq', 'syria',
        'yemen', 'japan', 'korea', 'canada', 'australia', 'france', 'germany', 'italy', 'spain', 'mexico',
        'brazil', 'turkey', 'egypt', 'saudi', 'uae', 'singapore', 'indonesia', 'malaysia', 'vietnam', 'thailand',
        'philippines', 'switzerland', 'sweden', 'norway', 'finland', 'netherlands', 'belgium', 'poland', 'greece',
        'portugal', 'south africa',
        // Continents & Regions
        'europe', 'asia', 'africa', 'americas', 'middle east', 'latin america', 'balkans',
        // Institutions & Groups
        'white house', 'pentagon', 'kremlin', 'nato', 'un', 'united nations', 'eu', 'european union', 'imf',
        'world bank', 'who', 'wto', 'asean', 'brics', 'g20', 'g7', 'cop28', 'cop29',
        // Major Global Cities
        'london', 'washington', 'moscow', 'beijing', 'tokyo', 'paris', 'berlin', 'rome', 'madrid', 'kyiv',
        'tehran', 'riyadh', 'dubai', 'seoul', 'sydney', 'toronto', 'geneva', 'brussels',
        // Adjectives & General Terms
        'american', 'british', 'chinese', 'russian', 'european', 'french', 'german', 'japanese', 'global',
        'world', 'foreign', 'border', 'international', 'summit', 'overseas', 'bilateral'
      ],
      sports: ['cricket', 'football', 'tennis', 'olympics', 'bcci', 'ipl', 'match', 'tournament', 'world cup', 'kohli', 'dhoni', 'messi', 'sport', 'athlete', 'cup', 'trophy', 'score', 'stadium'],
      national: [
        'india', 'delhi', 'mumbai', 'bengaluru', 'chennai', 'kolkata', 'hyderabad', 'pune', 'kerala', 'karnataka',
        'maharashtra', 'bihar', 'uttar pradesh', 'punjab', 'haryana', 'gujarat', 'rajasthan', 'kashmir',
        'modi', 'gandhi', 'nehru', 'kejriwal', 'mamata', 'parliament', 'congress', 'bjp', 'supreme court',
        'loksabha', 'rajyasabha', 'panchayat', 'ruling', 'opposition', 'union minister'
      ],
      entertainment: ['movie', 'film', 'bollywood', 'hollywood', 'actor', 'actress', 'celebrity', 'music', 'album', 'concert', 'streaming', 'netflix', 'disney', 'box office', 'tv show', 'series', 'oscar', 'grammy', 'emmy', 'entertainment', 'cinema', 'star', 'singer', 'song', 'theatre', 'drama']
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
      let predictedCategory = classifier.predict(fullText, source.category);

      // Prevent articles from non-national sources from being categorized under 'national'
      if (source.category !== 'national' && predictedCategory === 'national') {
        predictedCategory = source.category;
      }

      // 3. Bias Scoring via Source Mapping
      const baseSourceName = source.name.split(' - ')[0];
      const biasScore = getSourceBias(baseSourceName);

      // 4. Political Lean Detection (source-heavy)
      const politicalLean = detectPoliticalLean(title, description, biasScore, predictedCategory);

      // 5. Date Filter: Only current day's news (UTC-based for consistency with file naming)
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
        biasScore: biasScore,
        politicalLeanScore: politicalLean ? politicalLean.score : null,
        politicalLeanLabel: politicalLean ? politicalLean.label : null
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

  // --- Classification Pipeline ---
  if (supabase) {
    console.log("\n--- Sensationalism Classification Pipeline ---");
    try {
      const articlesToClassify = allArticles.map(a => ({
        title: a.title,
        description: a.description
      }));

      const { data, error } = await supabase.functions.invoke('detect-sensationalism', {
        body: { articles: articlesToClassify }
      });

      if (error) {
        console.error("Error invoking edge function:", error);
      } else if (data && data.results) {
        data.results.forEach((result, idx) => {
          allArticles[idx].sensationalism_score = result.score;
          allArticles[idx].sensationalism_label = result.label;
        });
        console.log(`Successfully classified ${data.results.length} articles.`);
      }
    } catch (err) {
      console.error("Failed to classify articles:", err);
    }
  }

  // --- Clustering Pipeline ---
  console.log("\n--- Clustering Pipeline ---");
  const stories = clusterArticles(allArticles);

  // Assign story indices to articles
  for (const story of stories) {
    for (const idx of story.articleIndices) {
      allArticles[idx].storyIndex = stories.indexOf(story);
    }
  }

  // Save local copy
  try {
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir);
    }
    const today = new Date().toISOString().split('T')[0];
    const filePath = path.join(dataDir, `${today}.json`);
    fs.writeFileSync(filePath, JSON.stringify({ articles: allArticles, stories }, null, 2));
    console.log(`Saved a local copy to data/${today}.json`);
  } catch (err) {
    console.error("Failed to save data locally:", err);
  }

  if (supabase) {
    try {
      // Delete old articles beyond the 1000 limit
      const { data: oldArticles } = await supabase
        .from('news')
        .select('id')
        .order('fetched_at', { ascending: false })
        .range(1000, 99999);

      if (oldArticles && oldArticles.length > 0) {
        const idsToDelete = oldArticles.map(a => a.id);
        await supabase.from('news').delete().in('id', idsToDelete);
        console.log(`Deleted ${idsToDelete.length} older articles to maintain limit.`);
      }

      // Delete old stories
      const { data: oldStories } = await supabase
        .from('stories')
        .select('id')
        .order('created_at', { ascending: false })
        .range(500, 99999);

      if (oldStories && oldStories.length > 0) {
        const storyIdsToDelete = oldStories.map(s => s.id);
        await supabase.from('stories').delete().in('id', storyIdsToDelete);
        console.log(`Deleted ${storyIdsToDelete.length} older stories.`);
      }

      // Step 1: Upsert stories first to get their IDs
      console.log("\nUpserting stories...");
      const storyRows = stories.map((s, i) => ({
        representative_title: s.representativeTitle,
        category: s.category,
        trend_score: s.trendScore,
        source_count: s.sourceCount,
        sources: s.sources
      }));

      // Insert stories and get back the IDs
      const insertedStoryIds = [];
      for (const storyRow of storyRows) {
        const { data, error } = await supabase
          .from('stories')
          .insert(storyRow)
          .select('id')
          .single();

        if (error) {
          console.error(`Error inserting story "${storyRow.representative_title.substring(0, 40)}...":`, error.message);
          insertedStoryIds.push(null);
        } else {
          insertedStoryIds.push(data.id);
        }
      }

      console.log(`Inserted ${insertedStoryIds.filter(Boolean).length} stories.`);

      // Step 2: Upsert articles with story_id references
      const toInsert = allArticles.map(a => {
        const storyId = (a.storyIndex !== undefined && insertedStoryIds[a.storyIndex])
          ? insertedStoryIds[a.storyIndex]
          : null;

        return {
          title: a.title,
          link: a.link,
          description: a.description,
          pub_date: a.pubDate,
          source: a.source,
          category: a.category,
          bias_score: a.biasScore,
          sensationalism_score: a.sensationalism_score,
          sensationalism_label: a.sensationalism_label,
          political_lean_score: a.politicalLeanScore,
          political_lean_label: a.politicalLeanLabel,
          story_id: storyId
        };
      });
      const uniqueToInsert = Array.from(new Map(toInsert.map(a => [a.link, a])).values());

      const { error } = await supabase
        .from('news')
        .upsert(uniqueToInsert, { onConflict: 'link', ignoreDuplicates: true });

      if (error) throw error;
      console.log(`Upserted ${uniqueToInsert.length} articles.`);
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
