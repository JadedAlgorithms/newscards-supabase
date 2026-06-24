const fs = require('fs');

// Load the trained model
const model = JSON.parse(fs.readFileSync('./supabase/functions/detect-sensationalism/model.json', 'utf8'));

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

function tokenize(text) {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopwords.has(w));
}

function classifyArticle(title, description = '') {
  // We double the title to match the edge function logic
  const fullText = `${title} ${title} ${description}`;
  const words = tokenize(fullText);

  let logProbS = model.logPriors['sensational'];
  let logProbNS = model.logPriors['non-sensational'];

  for (const word of words) {
    if (model.logLikelihoods[word]) {
      logProbS += model.logLikelihoods[word]['sensational'];
      logProbNS += model.logLikelihoods[word]['non-sensational'];
    } else {
      logProbS += model.defaultLogLikelihood['sensational'];
      logProbNS += model.defaultLogLikelihood['non-sensational'];
    }
  }

  const maxLog = Math.max(logProbS, logProbNS);
  const probS = Math.exp(logProbS - maxLog);
  const probNS = Math.exp(logProbNS - maxLog);
  
  const totalProb = probS + probNS;
  const normalizedProbS = probS / totalProb;

  return {
    score: Math.round(normalizedProbS * 100) / 100,
    label: logProbS > logProbNS ? "sensational" : "non-sensational",
  };
}

// Read headline from command line arguments
const input = process.argv.slice(2).join(' ');

if (input) {
  const result = classifyArticle(input);
  console.log(`Headline: "${input}"`);
  console.log(`Result:   ${result.label === 'sensational' ? '⚠️ SENSATIONAL' : '✅ OBJECTIVE'} (${Math.round(result.score * 100)}% confidence)\n`);
} else {
  // Run test examples
  const testCases = [
    "YOU WON'T BELIEVE WHAT HAPPENED NEXT!!!",
    "Top 10 ways to lose belly fat instantly. Number 3 will shock you!",
    "Federal Reserve Announces 0.25% Interest Rate Hike",
    "NASA spacecraft successfully lands on Mars to search for signs of life",
    "Is this the end of the world?! Mysterious lights seen in the sky",
    "Local school board votes to approve new curriculum standards"
  ];

  console.log("--- Naive Bayes Classifier Test ---\n");
  testCases.forEach(headline => {
    const result = classifyArticle(headline);
    console.log(`Headline: "${headline}"`);
    console.log(`Result:   ${result.label === 'sensational' ? '⚠️ SENSATIONAL' : '✅ OBJECTIVE'} (${Math.round(result.score * 100)}% confidence)\n`);
  });
  
  console.log("Usage: node test-classifier.js \"Your headline here\"");
}
