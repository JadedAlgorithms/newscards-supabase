/**
 * train-classifier.js — Train a Naive Bayes classifier for sensationalism detection
 * 
 * Downloads the christinacdl/clickbait_detection_dataset from HuggingFace,
 * trains a Naive Bayes model, and exports it as a JSON file that the
 * Supabase Edge Function can load at runtime.
 * 
 * Usage: node train-classifier.js
 * Output: ../supabase/functions/detect-sensationalism/model.json
 */

const fs = require('fs');
const path = require('path');

// ─── Configuration ──────────────────────────────────────────────────────────

const HF_API_BASE = 'https://datasets-server.huggingface.co';
const DATASET = 'christinacdl/clickbait_detection_dataset';
const CONFIG = 'default';
const SPLITS = ['train', 'validation']; // Use train + validation for training; test is held out
const OUTPUT_PATH = path.join(__dirname, '..', 'supabase', 'functions', 'detect-sensationalism', 'model.json');

// Min document frequency — words appearing in fewer docs than this are pruned
const MIN_DOC_FREQ = 3;

// Lightweight stopword list to replace the natural library
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

// ─── Tokenizer ──────────────────────────────────────────────────────────────

function tokenize(text) {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopwords.has(w));
}

// ─── HuggingFace Dataset Fetcher ────────────────────────────────────────────

async function fetchDatasetRows(split, offset = 0, length = 100) {
  const url = `${HF_API_BASE}/rows?dataset=${encodeURIComponent(DATASET)}&config=${CONFIG}&split=${split}&offset=${offset}&length=${length}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HF API error: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  return data.rows || [];
}

async function fetchAllRows(split) {
  console.log(`  Fetching split: ${split}...`);
  const allRows = [];
  let offset = 0;
  const batchSize = 100;
  let emptyCount = 0;

  while (true) {
    try {
      const rows = await fetchDatasetRows(split, offset, batchSize);
      if (!rows || rows.length === 0) {
        emptyCount++;
        if (emptyCount >= 3) break; // Three consecutive empty responses = done
        offset += batchSize;
        continue;
      }
      emptyCount = 0;
      allRows.push(...rows);
      offset += rows.length;

      if (offset % 5000 === 0 || rows.length < batchSize) {
        console.log(`    ... fetched ${allRows.length} rows`);
      }

      if (rows.length < batchSize) break; // Last partial page

      // Small delay to be nice to the API
      await new Promise(r => setTimeout(r, 50));
    } catch (err) {
      console.error(`    Error at offset ${offset}: ${err.message}`);
      // Retry once after a longer delay
      await new Promise(r => setTimeout(r, 2000));
      try {
        const rows = await fetchDatasetRows(split, offset, batchSize);
        if (!rows || rows.length === 0) break;
        allRows.push(...rows);
        offset += rows.length;
      } catch (retryErr) {
        console.error(`    Retry failed, stopping at ${allRows.length} rows`);
        break;
      }
    }
  }

  console.log(`    ✓ Total rows from ${split}: ${allRows.length}`);
  return allRows;
}

// ─── Naive Bayes Trainer ────────────────────────────────────────────────────

function trainNaiveBayes(documents) {
  console.log('\n── Training Naive Bayes ──');

  // Class labels
  const SENSATIONAL = 'sensational';
  const NON_SENSATIONAL = 'non-sensational';

  // Count documents per class
  const classCounts = { [SENSATIONAL]: 0, [NON_SENSATIONAL]: 0 };

  // Word frequency per class: { word: { sensational: count, non-sensational: count } }
  const wordFreqs = {};

  // Total words per class
  const classTotalWords = { [SENSATIONAL]: 0, [NON_SENSATIONAL]: 0 };

  // Document frequency per word (for pruning rare words)
  const docFreqs = {};

  // Pass 1: Count everything
  for (const doc of documents) {
    const label = doc.label === 1 ? SENSATIONAL : NON_SENSATIONAL;
    classCounts[label]++;

    const words = tokenize(doc.text);
    const uniqueWords = new Set(words);

    for (const word of words) {
      if (!wordFreqs[word]) {
        wordFreqs[word] = { [SENSATIONAL]: 0, [NON_SENSATIONAL]: 0 };
      }
      wordFreqs[word][label]++;
      classTotalWords[label]++;
    }

    for (const word of uniqueWords) {
      docFreqs[word] = (docFreqs[word] || 0) + 1;
    }
  }

  console.log(`  Documents: ${documents.length}`);
  console.log(`    Sensational: ${classCounts[SENSATIONAL]}`);
  console.log(`    Non-sensational: ${classCounts[NON_SENSATIONAL]}`);
  console.log(`  Unique words (before pruning): ${Object.keys(wordFreqs).length}`);

  // Prune rare words
  const prunedWords = {};
  for (const [word, freq] of Object.entries(wordFreqs)) {
    if ((docFreqs[word] || 0) >= MIN_DOC_FREQ) {
      prunedWords[word] = freq;
    }
  }
  console.log(`  Unique words (after pruning, min df=${MIN_DOC_FREQ}): ${Object.keys(prunedWords).length}`);

  const vocabSize = Object.keys(prunedWords).length;

  // Compute log-priors
  const totalDocs = classCounts[SENSATIONAL] + classCounts[NON_SENSATIONAL];
  const logPriors = {
    [SENSATIONAL]: Math.log(classCounts[SENSATIONAL] / totalDocs),
    [NON_SENSATIONAL]: Math.log(classCounts[NON_SENSATIONAL] / totalDocs),
  };

  console.log(`  Log-priors: sensational=${logPriors[SENSATIONAL].toFixed(4)}, non-sensational=${logPriors[NON_SENSATIONAL].toFixed(4)}`);

  // Compute log-likelihoods with Laplace smoothing
  const logLikelihoods = {};
  for (const [word, freqs] of Object.entries(prunedWords)) {
    logLikelihoods[word] = {
      [SENSATIONAL]: Math.log((freqs[SENSATIONAL] + 1) / (classTotalWords[SENSATIONAL] + vocabSize)),
      [NON_SENSATIONAL]: Math.log((freqs[NON_SENSATIONAL] + 1) / (classTotalWords[NON_SENSATIONAL] + vocabSize)),
    };
  }

  // Default log-likelihood for unknown words (Laplace smoothed with count=0)
  const defaultLogLikelihood = {
    [SENSATIONAL]: Math.log(1 / (classTotalWords[SENSATIONAL] + vocabSize)),
    [NON_SENSATIONAL]: Math.log(1 / (classTotalWords[NON_SENSATIONAL] + vocabSize)),
  };

  const model = {
    logPriors,
    logLikelihoods,
    defaultLogLikelihood,
    vocabularySize: vocabSize,
    classTotalWords,
    trainedAt: new Date().toISOString(),
    datasetSource: `huggingface: ${DATASET}`,
    totalTrainingDocs: documents.length,
  };

  return model;
}

// ─── Evaluation ─────────────────────────────────────────────────────────────

function evaluate(model, testDocs) {
  console.log('\n── Evaluating on test set ──');

  let correct = 0;
  let total = 0;
  let tp = 0, fp = 0, fn = 0, tn = 0;

  for (const doc of testDocs) {
    const expected = doc.label === 1 ? 'sensational' : 'non-sensational';
    const words = tokenize(doc.text);

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

    const predicted = logProbS > logProbNS ? 'sensational' : 'non-sensational';

    if (predicted === expected) correct++;
    total++;

    if (expected === 'sensational' && predicted === 'sensational') tp++;
    if (expected === 'non-sensational' && predicted === 'sensational') fp++;
    if (expected === 'sensational' && predicted === 'non-sensational') fn++;
    if (expected === 'non-sensational' && predicted === 'non-sensational') tn++;
  }

  const accuracy = (correct / total * 100).toFixed(2);
  const precision = (tp / (tp + fp) * 100).toFixed(2);
  const recall = (tp / (tp + fn) * 100).toFixed(2);
  const f1 = (2 * tp / (2 * tp + fp + fn) * 100).toFixed(2);

  console.log(`  Accuracy:  ${accuracy}% (${correct}/${total})`);
  console.log(`  Precision: ${precision}%`);
  console.log(`  Recall:    ${recall}%`);
  console.log(`  F1 Score:  ${f1}%`);
  console.log(`  Confusion Matrix:`);
  console.log(`    TP=${tp} FP=${fp}`);
  console.log(`    FN=${fn} TN=${tn}`);

  return { accuracy: parseFloat(accuracy), precision: parseFloat(precision), recall: parseFloat(recall), f1: parseFloat(f1) };
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  Naive Bayes Sensationalism Classifier — Trainer');
  console.log('═══════════════════════════════════════════════════');
  console.log(`\nDataset: ${DATASET}`);

  // Fetch training data
  console.log('\n── Fetching training data ──');
  let trainDocs = [];
  for (const split of SPLITS) {
    const rows = await fetchAllRows(split);
    trainDocs.push(...rows.map(r => r.row));
  }

  console.log(`\n  Total training documents: ${trainDocs.length}`);

  // Fetch test data
  console.log('\n── Fetching test data ──');
  const testRows = await fetchAllRows('test');
  const testDocs = testRows.map(r => r.row);
  console.log(`  Total test documents: ${testDocs.length}`);

  // Train
  const model = trainNaiveBayes(trainDocs);

  // Evaluate on held-out test set
  const metrics = evaluate(model, testDocs);

  // Add metrics to model metadata
  model.testMetrics = metrics;

  // Save model
  const outputDir = path.dirname(OUTPUT_PATH);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(model));
  const fileSizeKB = (fs.statSync(OUTPUT_PATH).size / 1024).toFixed(1);
  console.log(`\n── Model saved ──`);
  console.log(`  Path: ${OUTPUT_PATH}`);
  console.log(`  Size: ${fileSizeKB} KB`);
  console.log(`  Vocabulary: ${model.vocabularySize} words`);

  // Show some example classifications
  console.log('\n── Sample classifications ──');
  const samples = [
    "You Won't Believe What Happened Next!!!",
    "Parliament passes new agriculture bill",
    "SHOCKING: Celebrity caught in scandal!",
    "RBI holds interest rates steady at 6.5%",
    "This Dog's Reaction To Meeting A Baby Will Melt Your Heart",
    "India's GDP growth slows to 6.3% in Q2",
    "23 Things That Will Make You Say Why Didn't I Think Of That",
    "Supreme Court upholds lower court ruling on land acquisition",
  ];

  for (const text of samples) {
    const words = tokenize(text);
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

    // Convert to probability using log-sum-exp
    const maxLog = Math.max(logProbS, logProbNS);
    const probS = Math.exp(logProbS - maxLog);
    const probNS = Math.exp(logProbNS - maxLog);
    const total = probS + probNS;
    const confidence = (Math.max(probS, probNS) / total * 100).toFixed(1);

    const label = logProbS > logProbNS ? '🔴 SENSATIONAL' : '🟢 NON-SENSATIONAL';
    console.log(`  ${label} (${confidence}%) — "${text}"`);
  }

  console.log('\n═══════════════════════════════════════════════════');
  console.log('  Training complete!');
  console.log('═══════════════════════════════════════════════════');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
