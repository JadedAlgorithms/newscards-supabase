/**
 * cluster.js — TF-IDF + Cosine Similarity article clustering
 * 
 * Groups articles about the same story together using:
 * 1. TF-IDF vectorization (via `natural` package)
 * 2. Cosine similarity between article vectors
 * 3. Agglomerative clustering with a configurable threshold
 * 
 * Each resulting cluster represents one "story" covered by one or more sources.
 */

// Lightweight stopword list
const stopwords = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'aren', "aren't",
  'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by', 'can', 'cannot',
  'could', 'couldn', "couldn't", 'did', 'didn', "didn't", 'do', 'does', 'doesn', "doesn't", 'doing', 'don', "don't",
  'down', 'during', 'each', 'few', 'for', 'from', 'further', 'had', 'hadn', "hadn't", 'has', 'hasn', "hasn't",
  'have', 'haven', "haven't", 'having', 'he', "he'd", "he'll", "he's", 'her', 'here', "here's", 'hers', 'herself',
  'him', 'himself', 'his', 'how', "how's", 'i', "i'd", "i'll", "i'm", "i've", 'if', 'in', 'into', 'is', 'isn', "isn't",
  'it', "it's", 'its', 'itself', 'let', "let's", 'me', 'more', 'most', 'mustn', "mustn't", 'my', 'myself', 'no',
  'nor', 'not', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'ought', 'our', 'ours', 'ourselves', 'out', 'over',
  'own', 'same', 'shan', "shan't", 'she', "she'd", "she'll", "she's", 'should', 'shouldn', "shouldn't", 'so', 'some',
  'such', 'than', 'that', "that's", 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', "there's", 'these',
  'they', "they'd", "they'll", "they're", "they've", 'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up',
  'very', 'was', 'wasn', "wasn't", 'we', "we'd", "we'll", "we're", "we've", 'were', 'weren', "weren't", 'what', "what's",
  'when', "when's", 'where', "where's", 'which', 'while', 'who', "who's", 'whom', 'why', "why's", 'with', 'won', "won't",
  'would', 'wouldn', "wouldn't", 'you', "you'd", "you'll", "you're", "you've", 'your', 'yours', 'yourself', 'yourselves'
]);

// Similarity threshold: articles with cosine similarity >= this are grouped together.
// 0.25 is intentionally permissive — catches same-story articles with different wording.
const SIMILARITY_THRESHOLD = 0.25;

/**
 * Tokenize and clean text for TF-IDF processing.
 * Removes stopwords, punctuation, and short tokens.
 */
function tokenize(text) {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopwords.has(w));
}

/**
 * Compute cosine similarity between two term-frequency maps.
 */
function cosineSimilarity(vecA, vecB) {
  const allTerms = new Set([...Object.keys(vecA), ...Object.keys(vecB)]);
  let dotProduct = 0;
  let magA = 0;
  let magB = 0;

  for (const term of allTerms) {
    const a = vecA[term] || 0;
    const b = vecB[term] || 0;
    dotProduct += a * b;
    magA += a * a;
    magB += b * b;
  }

  if (magA === 0 || magB === 0) return 0;
  return dotProduct / (Math.sqrt(magA) * Math.sqrt(magB));
}

/**
 * Build simple TF vectors (Term Frequency) for all articles.
 * We'll use simple TF instead of TF-IDF to avoid the natural dependency.
 * Returns an array of { articleIndex, vector } objects.
 */
function buildVectors(articles) {
  const vectors = [];

  for (let i = 0; i < articles.length; i++) {
    const article = articles[i];
    const text = `${article.title || ''} ${article.title || ''} ${article.description || ''}`;
    const tokens = tokenize(text);
    
    const vector = {};
    for (const token of tokens) {
      vector[token] = (vector[token] || 0) + 1;
    }
    vectors.push(vector);
  }

  return vectors;
}

/**
 * Agglomerative clustering using single-linkage.
 * 
 * Each article starts in its own cluster. We iteratively merge
 * the two most similar clusters until no pair exceeds the threshold.
 */
function agglomerativeCluster(articles, vectors) {
  // Initialize: each article is its own cluster
  let clusters = articles.map((_, i) => [i]);

  // Precompute pairwise similarity (only upper triangle)
  const n = vectors.length;
  const simCache = new Map();

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const sim = cosineSimilarity(vectors[i], vectors[j]);
      if (sim >= SIMILARITY_THRESHOLD) {
        simCache.set(`${i}-${j}`, sim);
      }
    }
  }

  // Iteratively merge most similar clusters
  let merged = true;
  while (merged) {
    merged = false;
    let bestSim = 0;
    let bestI = -1;
    let bestJ = -1;

    for (let ci = 0; ci < clusters.length; ci++) {
      for (let cj = ci + 1; cj < clusters.length; cj++) {
        // Single-linkage: max similarity between any pair of articles in the two clusters
        let maxSim = 0;
        for (const ai of clusters[ci]) {
          for (const aj of clusters[cj]) {
            const key = ai < aj ? `${ai}-${aj}` : `${aj}-${ai}`;
            const sim = simCache.get(key) || 0;
            if (sim > maxSim) maxSim = sim;
          }
        }

        if (maxSim > bestSim) {
          bestSim = maxSim;
          bestI = ci;
          bestJ = cj;
        }
      }
    }

    if (bestSim >= SIMILARITY_THRESHOLD && bestI !== -1) {
      // Merge cluster bestJ into bestI
      clusters[bestI] = [...clusters[bestI], ...clusters[bestJ]];
      clusters.splice(bestJ, 1);
      merged = true;
    }
  }

  return clusters;
}

/**
 * Main clustering function.
 * 
 * Takes an array of articles and returns an array of story objects:
 * {
 *   representativeTitle: string,
 *   category: string,
 *   trendScore: number,
 *   sourceCount: number,
 *   sources: string[],
 *   articleIndices: number[]
 * }
 */
function clusterArticles(articles) {
  if (!articles || articles.length === 0) return [];

  console.log(`[Cluster] Vectorizing ${articles.length} articles...`);
  const vectors = buildVectors(articles);

  console.log(`[Cluster] Running agglomerative clustering (threshold=${SIMILARITY_THRESHOLD})...`);
  const clusters = agglomerativeCluster(articles, vectors);

  console.log(`[Cluster] Found ${clusters.length} story clusters from ${articles.length} articles`);

  // Build story objects from clusters
  const stories = clusters.map(articleIndices => {
    const clusterArticles = articleIndices.map(i => articles[i]);

    // Representative title: longest title (usually most descriptive)
    const representativeTitle = clusterArticles
      .sort((a, b) => (b.title || '').length - (a.title || '').length)[0].title;

    // Category: most frequent in the cluster
    const categoryCounts = {};
    clusterArticles.forEach(a => {
      const cat = a.category || 'national';
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    });
    const category = Object.entries(categoryCounts)
      .sort((a, b) => b[1] - a[1])[0][0];

    // Sources: unique source names
    const sources = [...new Set(clusterArticles.map(a => a.source).filter(Boolean))];
    const trendScore = sources.length;

    return {
      representativeTitle,
      category,
      trendScore,
      sourceCount: trendScore,
      sources,
      articleIndices
    };
  });

  // Log some stats
  const multiSource = stories.filter(s => s.sourceCount > 1);
  console.log(`[Cluster] ${multiSource.length} stories covered by multiple sources`);
  if (multiSource.length > 0) {
    const top = multiSource.sort((a, b) => b.trendScore - a.trendScore).slice(0, 3);
    top.forEach(s => {
      console.log(`  → "${s.representativeTitle.substring(0, 60)}..." (${s.sourceCount} sources: ${s.sources.join(', ')})`);
    });
  }

  return stories;
}

module.exports = { clusterArticles };
