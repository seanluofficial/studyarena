/**
 * validate.js — validates a raw JSON batch from claude.ai before import
 *
 * Usage:
 *   node validate.js ../content/raw/ap_chemistry_unit4_batch1.json
 *   node validate.js ../content/raw/  (validates all .json files in directory)
 *
 * On success: copies file to ../content/validated/
 * On failure: copies file + error report to ../content/rejected/
 */

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');
const math = require('mathjs');

// ─── Constants ───────────────────────────────────────────────────────────────

const VALID_TYPES       = ['mc_static', 'mc_numeric', 'fr_static', 'fr_numeric'];
const VALID_DIFFICULTIES = ['easy', 'medium', 'hard'];
const VALID_VISUAL_TYPES = ['smiles', 'image', 'data_chart'];
const VALID_SUBJECTS    = [
  'AP Chemistry',
  'AP Biology',
  'AP US History',
  'AP Psychology',
  'AP Calculus AB',
];

const FORMULA_SAMPLE_COUNT = 10;

// ─── Card validation ─────────────────────────────────────────────────────────

function validateCard(card, idx) {
  const errors = [];
  const tag = `[card ${idx}]`;

  // Envelope
  if (!VALID_SUBJECTS.includes(card.subject))
    errors.push(`${tag} invalid subject: "${card.subject}"`);
  if (!card.unit)
    errors.push(`${tag} missing unit`);
  if (typeof card.unit_exam_weight_pct !== 'number')
    errors.push(`${tag} unit_exam_weight_pct must be a number`);
  if (!card.deck)
    errors.push(`${tag} missing deck`);
  if (!VALID_TYPES.includes(card.type))
    errors.push(`${tag} invalid type: "${card.type}"`);
  if (!VALID_DIFFICULTIES.includes(card.difficulty))
    errors.push(`${tag} invalid difficulty: "${card.difficulty}"`);
  if (!card.content || typeof card.content !== 'object')
    errors.push(`${tag} missing or invalid content`);

  if (errors.length) return errors; // stop — envelope is broken

  // Visual (optional)
  if (card.visual != null) {
    errors.push(...validateVisual(card.visual, tag));
  }

  // Type-specific content
  const c = card.content;
  switch (card.type) {
    case 'mc_static':
      errors.push(...validateMcStatic(c, tag));
      break;
    case 'mc_numeric':
      errors.push(...validateMcNumeric(c, tag));
      break;
    case 'fr_static':
      errors.push(...validateFrStatic(c, tag));
      break;
    case 'fr_numeric':
      errors.push(...validateFrNumeric(c, tag));
      break;
  }

  return errors;
}

function validateVisual(v, tag) {
  const errors = [];
  if (!VALID_VISUAL_TYPES.includes(v.type))
    errors.push(`${tag} visual.type must be one of: ${VALID_VISUAL_TYPES.join(', ')}`);

  if (v.type === 'smiles') {
    if (!v.value || typeof v.value !== 'string' || v.value.trim() === '')
      errors.push(`${tag} visual.value (SMILES string) is required and must be non-empty`);
  }

  if (v.type === 'image') {
    if (!v.path || typeof v.path !== 'string' || v.path.trim() === '')
      errors.push(`${tag} visual.path is required for image type`);
    if (!v.alt || typeof v.alt !== 'string' || v.alt.trim() === '')
      errors.push(`${tag} visual.alt is required for image type`);
  }

  return errors;
}

function validateMcStatic(c, tag) {
  const errors = [];
  if (!c.stem || typeof c.stem !== 'string')
    errors.push(`${tag} missing stem`);
  if (!Array.isArray(c.options) || c.options.length !== 4)
    errors.push(`${tag} options must be an array of exactly 4 strings`);
  else if (new Set(c.options).size !== 4)
    errors.push(`${tag} options contains duplicates`);
  if (typeof c.correct_index !== 'number' || c.correct_index < 0 || c.correct_index > 3)
    errors.push(`${tag} correct_index must be 0–3`);
  return errors;
}

function validateMcNumeric(c, tag) {
  const errors = [];

  if (!c.stem) errors.push(`${tag} missing stem`);
  if (!c.params || typeof c.params !== 'object')
    errors.push(`${tag} missing params`);
  if (!c.answer_formula)
    errors.push(`${tag} missing answer_formula`);
  if (!Array.isArray(c.distractors) || c.distractors.length !== 3)
    errors.push(`${tag} distractors must be an array of exactly 3 objects`);
  if (typeof c.precision !== 'number')
    errors.push(`${tag} missing precision`);

  if (errors.length) return errors; // formula checks need params + formula

  // Placeholder consistency: every {{var}} in stem must be in params
  const stemVars   = [...(c.stem.matchAll(/\{\{(\w+)\}\}/g))].map(m => m[1]);
  const paramKeys  = Object.keys(c.params);
  const missing    = stemVars.filter(v => !paramKeys.includes(v));
  const unused     = paramKeys.filter(v => !stemVars.includes(v));
  if (missing.length)
    errors.push(`${tag} stem uses vars not in params: ${missing.join(', ')}`);
  if (unused.length)
    errors.push(`${tag} params defined but not used in stem: ${unused.join(', ')}`);

  // Param range sanity
  for (const [key, range] of Object.entries(c.params)) {
    if (typeof range.min !== 'number' || typeof range.max !== 'number' || typeof range.step !== 'number')
      errors.push(`${tag} param "${key}" must have numeric min, max, step`);
    else if (range.min >= range.max)
      errors.push(`${tag} param "${key}" min must be less than max`);
    else if (range.step <= 0)
      errors.push(`${tag} param "${key}" step must be > 0`);
  }

  if (errors.length) return errors;

  // Formula evaluation: sample FORMULA_SAMPLE_COUNT combinations
  errors.push(...checkMcNumericFormulas(c, tag));
  return errors;
}

function validateFrStatic(c, tag) {
  const errors = [];
  if (!c.stem) errors.push(`${tag} missing stem`);
  if (!Array.isArray(c.accepted_answers) || c.accepted_answers.length === 0)
    errors.push(`${tag} accepted_answers must be a non-empty array`);
  else {
    const nonLower = c.accepted_answers.filter(a => a !== a.toLowerCase());
    if (nonLower.length)
      errors.push(`${tag} accepted_answers must be lowercase: ${nonLower.map(a => `"${a}"`).join(', ')}`);
  }
  if (typeof c.semantic_fallback !== 'boolean')
    errors.push(`${tag} semantic_fallback must be a boolean`);
  return errors;
}

function validateFrNumeric(c, tag) {
  const errors = [];
  if (!c.stem) errors.push(`${tag} missing stem`);
  if (!c.params) errors.push(`${tag} missing params`);
  if (!c.answer_formula) errors.push(`${tag} missing answer_formula`);
  if (typeof c.precision !== 'number') errors.push(`${tag} missing precision`);
  if (c.semantic_fallback !== false)
    errors.push(`${tag} fr_numeric must have semantic_fallback: false`);

  if (errors.length) return errors;

  for (let i = 0; i < FORMULA_SAMPLE_COUNT; i++) {
    const params = sampleParams(c.params);
    try {
      const result = math.evaluate(c.answer_formula, params);
      const val = parseFloat(result.toFixed(c.precision));
      const allowNeg = c.allow_negative === true;
      if (!isFinite(val) || isNaN(val))
        errors.push(`${tag} answer_formula non-finite with params ${JSON.stringify(params)}`);
      else if (!allowNeg && val < 0)
        errors.push(`${tag} answer_formula negative (set allow_negative:true if intended) with params ${JSON.stringify(params)}`);
    } catch (e) {
      errors.push(`${tag} answer_formula eval error: ${e.message}`);
      break;
    }
  }
  return errors;
}

// ─── Formula helpers ─────────────────────────────────────────────────────────

function sampleParams(params) {
  const result = {};
  for (const [key, range] of Object.entries(params)) {
    const steps = Math.round((range.max - range.min) / range.step);
    const pick  = Math.floor(Math.random() * (steps + 1));
    result[key] = parseFloat((range.min + pick * range.step).toFixed(10));
  }
  return result;
}

function checkMcNumericFormulas(c, tag) {
  const errors = [];
  const precision = c.precision;
  const allowNeg  = c.allow_negative === true;

  for (let i = 0; i < FORMULA_SAMPLE_COUNT; i++) {
    const params = sampleParams(c.params);
    let correct;

    try {
      correct = parseFloat(math.evaluate(c.answer_formula, params).toFixed(precision));
    } catch (e) {
      errors.push(`${tag} answer_formula eval error with ${JSON.stringify(params)}: ${e.message}`);
      break;
    }

    if (!isFinite(correct) || isNaN(correct)) {
      errors.push(`${tag} answer_formula non-finite with ${JSON.stringify(params)}`);
      break;
    }
    if (!allowNeg && correct < 0) {
      errors.push(`${tag} answer_formula negative (set allow_negative:true if intended) with ${JSON.stringify(params)}`);
    }

    const distractorVals = [];
    for (const d of c.distractors) {
      let val;
      try {
        val = parseFloat(math.evaluate(d.formula, params).toFixed(precision));
      } catch (e) {
        errors.push(`${tag} distractor formula "${d.formula}" eval error: ${e.message}`);
        continue;
      }
      if (val === correct)
        errors.push(`${tag} distractor "${d.formula}" equals correct answer ${correct} with ${JSON.stringify(params)}`);
      distractorVals.push(val);
    }

    if (new Set(distractorVals).size < distractorVals.length)
      errors.push(`${tag} duplicate distractor values with ${JSON.stringify(params)}`);
  }

  return errors;
}

// ─── Duplicate detection ─────────────────────────────────────────────────────

function contentHash(card) {
  const stem = card.content?.stem
    ?? JSON.stringify(card.content?.options)
    ?? '';
  return crypto
    .createHash('sha256')
    .update(`${card.subject}|${card.unit}|${stem}`)
    .digest('hex')
    .slice(0, 16);
}

function checkBatchDuplicates(cards) {
  const errors = [];
  const seen   = new Map();
  for (let i = 0; i < cards.length; i++) {
    const h = contentHash(cards[i]);
    if (seen.has(h))
      errors.push(`[card ${i}] duplicate of card ${seen.get(h)} (same subject+unit+stem)`);
    else
      seen.set(h, i);
  }
  return errors;
}

// ─── File I/O ────────────────────────────────────────────────────────────────

function resolveDirectories(inputPath) {
  const abs     = path.resolve(inputPath);
  const rawDir  = path.dirname(abs);
  const baseDir = rawDir.endsWith('raw') ? path.dirname(rawDir) : rawDir;
  return {
    validatedDir: path.join(baseDir, 'validated'),
    rejectedDir:  path.join(baseDir, 'rejected'),
  };
}

function processFile(filePath) {
  console.log(`\nValidating: ${filePath}`);

  let cards;
  try {
    cards = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    console.error(`  ✗ JSON parse failed: ${e.message}`);
    return false;
  }

  if (!Array.isArray(cards)) {
    console.error('  ✗ File must contain a JSON array');
    return false;
  }

  const allErrors = [];
  for (let i = 0; i < cards.length; i++) {
    allErrors.push(...validateCard(cards[i], i));
  }
  allErrors.push(...checkBatchDuplicates(cards));

  const { validatedDir, rejectedDir } = resolveDirectories(filePath);
  const baseName = path.basename(filePath);

  if (allErrors.length === 0) {
    fs.mkdirSync(validatedDir, { recursive: true });
    fs.copyFileSync(filePath, path.join(validatedDir, baseName));
    console.log(`  ✓ ${cards.length} cards — copied to validated/`);
    return true;
  } else {
    fs.mkdirSync(rejectedDir, { recursive: true });
    fs.copyFileSync(filePath, path.join(rejectedDir, baseName));
    const report = {
      source:      filePath,
      card_count:  cards.length,
      error_count: allErrors.length,
      errors:      allErrors,
    };
    fs.writeFileSync(
      path.join(rejectedDir, baseName.replace('.json', '_errors.json')),
      JSON.stringify(report, null, 2),
    );
    console.error(`  ✗ ${allErrors.length} error(s) — moved to rejected/`);
    allErrors.forEach(e => console.error(`    ${e}`));
    return false;
  }
}

// ─── Entry point ─────────────────────────────────────────────────────────────

function main() {
  const target = process.argv[2];
  if (!target) {
    console.error('Usage: node validate.js <file.json|directory>');
    process.exit(1);
  }

  const abs = path.resolve(target);
  const stat = fs.statSync(abs);

  let files;
  if (stat.isDirectory()) {
    files = fs.readdirSync(abs)
      .filter(f => f.endsWith('.json') && !f.endsWith('_errors.json'))
      .map(f => path.join(abs, f));
    if (files.length === 0) {
      console.log('No JSON files found in directory.');
      process.exit(0);
    }
  } else {
    files = [abs];
  }

  let passed = 0, failed = 0;
  for (const f of files) {
    if (processFile(f)) passed++;
    else failed++;
  }

  console.log(`\nDone: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
