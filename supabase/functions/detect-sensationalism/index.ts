// Supabase Edge Function: detect-sensationalism
// Classifies news articles as "sensational" or "non-sensational"
// using a Naive Bayes model trained on the christinacdl/clickbait_detection_dataset.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import model from "./model.json" assert { type: "json" };

// ─── Tokenizer ──────────────────────────────────────────────────────────────

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

function tokenize(text: string): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopwords.has(w));
}

// ─── Classifier ─────────────────────────────────────────────────────────────

interface ArticleInput {
  title: string;
  description?: string;
}

interface ClassificationResult {
  score: number; // Probability of being sensational
  label: "sensational" | "non-sensational";
}

function classifyArticle(article: ArticleInput): ClassificationResult {
  const title = article.title || "";
  const description = article.description || "";
  // Weight title more heavily, as it's the strongest clickbait signal
  const fullText = `${title} ${title} ${description}`;
  const words = tokenize(fullText);

  let logProbS = model.logPriors['sensational'];
  let logProbNS = model.logPriors['non-sensational'];

  for (const word of words) {
    if (model.logLikelihoods[word]) {
      logProbS += model.logLikelihoods[word]['sensational'];
      logProbNS += model.logLikelihoods[word]['non-sensational'];
    } else {
      // Use Laplace smoothed default for unknown words
      logProbS += model.defaultLogLikelihood['sensational'];
      logProbNS += model.defaultLogLikelihood['non-sensational'];
    }
  }

  // Convert log-probabilities to normal probabilities using log-sum-exp trick
  // to avoid numerical underflow
  const maxLog = Math.max(logProbS, logProbNS);
  const probS = Math.exp(logProbS - maxLog);
  const probNS = Math.exp(logProbNS - maxLog);
  
  const totalProb = probS + probNS;
  const normalizedProbS = probS / totalProb;

  return {
    score: Math.round(normalizedProbS * 100) / 100, // round to 2 decimal places
    label: logProbS > logProbNS ? "sensational" : "non-sensational",
  };
}

// ─── HTTP Handler ───────────────────────────────────────────────────────────

serve(async (req: Request) => {
  // CORS headers for browser requests
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  // Handle preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { articles } = await req.json();

    if (!articles || !Array.isArray(articles)) {
      return new Response(
        JSON.stringify({ error: "Expected { articles: [...] }" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: ClassificationResult[] = articles.map(
      (article: ArticleInput) => classifyArticle(article)
    );

    return new Response(JSON.stringify({ results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Invalid request", details: String(err) }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
