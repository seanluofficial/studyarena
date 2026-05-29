require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');

const CONTENT_DIR = path.join(__dirname, '..', 'content', 'apchem');

// ─── Supabase (lazy) ──────────────────────────────────────────────────────────

let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { realtime: { transport: ws } }
    );
  }
  return _supabase;
}

// ─── DB query ─────────────────────────────────────────────────────────────────

async function pickQuestionsFromDB(subject, n) {
  const supabase = getSupabase();

  const { data: cards, error: cardsErr } = await supabase
    .from('source_cards')
    .select('id')
    .eq('subject', subject)
    .eq('reviewed', true);

  if (cardsErr) throw cardsErr;
  if (!cards || cards.length === 0) throw new Error(`No reviewed cards for subject: ${subject}`);

  // Shuffle card IDs in JS so every battle draws from a different random subset
  const cardIds = cards.map(c => c.id);
  for (let i = cardIds.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cardIds[i], cardIds[j]] = [cardIds[j], cardIds[i]];
  }
  const sampleIds = cardIds.slice(0, n * 4);

  const { data: variants, error: varErr } = await supabase
    .from('question_variants')
    .select('id, rendered_stem, rendered_options, correct_index')
    .in('source_card_id', sampleIds)
    .not('rendered_options', 'is', null);

  if (varErr) throw varErr;
  if (!variants || variants.length === 0) throw new Error(`No variants for subject: ${subject}`);

  // Shuffle and return n
  for (let i = variants.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [variants[i], variants[j]] = [variants[j], variants[i]];
  }

  return variants.slice(0, n).map(row => ({
    id: row.id,
    stem: row.rendered_stem,
    options: row.rendered_options,
    correct_index: row.correct_index,
  }));
}

// ─── JSON fallback helpers ────────────────────────────────────────────────────

function loadAllCards() {
  const files = fs.readdirSync(CONTENT_DIR)
    .filter(f => /^unit\d+\.json$/.test(f))
    .sort();

  const cards = [];
  for (const file of files) {
    const raw = JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, file), 'utf8'));
    for (const card of raw) {
      if (card.type === 'mc_static' || card.type === 'mc_numeric') {
        cards.push(card);
      }
    }
  }
  return cards;
}

function evalFormula(formula, params) {
  const keys = Object.keys(params);
  const vals = keys.map(k => params[k]);
  // eslint-disable-next-line no-new-func
  return new Function(...keys, `return (${formula})`).call(null, ...vals);
}

function sampleParams(paramDefs) {
  const result = {};
  for (const [key, def] of Object.entries(paramDefs)) {
    const { min, max, step = 1 } = def;
    const steps = Math.floor((max - min) / step);
    result[key] = min + Math.floor(Math.random() * (steps + 1)) * step;
  }
  return result;
}

function fillTemplate(str, params) {
  return str.replace(/\{\{(\w+)\}\}/g, (_, k) => params[k] ?? `{{${k}}}`);
}

function renderCard(card) {
  if (card.type === 'mc_static') {
    return {
      id: card.content.stem.slice(0, 32),
      stem: card.content.stem,
      options: card.content.options,
      correct_index: card.content.correct_index,
    };
  }

  const { stem, params: paramDefs, answer_formula, precision = 2, unit = '', distractors } = card.content;

  for (let attempt = 0; attempt < 10; attempt++) {
    const params = sampleParams(paramDefs);
    const fmt = (v) => {
      const n = parseFloat(v.toFixed(precision));
      return unit ? `${n} ${unit}` : String(n);
    };

    let answerVal;
    try { answerVal = evalFormula(answer_formula, params); } catch { continue; }
    if (!isFinite(answerVal)) continue;

    const answerStr = fmt(answerVal);
    const distractorStrs = [];
    let ok = true;
    for (const d of distractors) {
      let dVal;
      try { dVal = evalFormula(d.formula, params); } catch { ok = false; break; }
      if (!isFinite(dVal)) { ok = false; break; }
      const dStr = fmt(dVal);
      if (dStr === answerStr || distractorStrs.includes(dStr)) { ok = false; break; }
      distractorStrs.push(dStr);
    }
    if (!ok) continue;

    const options = [answerStr, ...distractorStrs];
    for (let i = options.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [options[i], options[j]] = [options[j], options[i]];
    }

    return {
      id: `${answer_formula}_${JSON.stringify(params)}`,
      stem: fillTemplate(stem, params),
      options,
      correct_index: options.indexOf(answerStr),
    };
  }

  return null;
}

let cachedCards = null;
function pickQuestionsFromJSON(n) {
  if (!cachedCards) cachedCards = loadAllCards();
  const pool = [...cachedCards];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const questions = [];
  for (const card of pool) {
    if (questions.length >= n) break;
    const q = renderCard(card);
    if (q) questions.push(q);
  }
  return questions;
}

// ─── Public API ───────────────────────────────────────────────────────────────

async function pickQuestions(subject, n = 10) {
  if (process.env.SUPABASE_URL) {
    try {
      return await pickQuestionsFromDB(subject, n);
    } catch (err) {
      console.warn('[questions] DB failed, falling back to JSON:', err.message);
    }
  }
  return pickQuestionsFromJSON(n);
}

module.exports = { pickQuestions };
