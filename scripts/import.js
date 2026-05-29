#!/usr/bin/env node
'use strict';

// Reads all content/apchem/unit*_clean.json files and upserts them into
// source_cards + question_variants in Supabase using the service role key.
// Safe to run multiple times — uses ON CONFLICT (content_hash) DO NOTHING.

require('dotenv').config({ path: require('path').join(__dirname, '..', 'server', '.env') });
// Windows: Node's bundled CA store may not include the intermediate cert for Supabase
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const fs   = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const SUPABASE_URL              = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in server/.env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const CLEAN_DIR = path.join(__dirname, '..', 'content', 'apchem');
const C = {
  reset:'\x1b[0m', bold:'\x1b[1m',
  green:'\x1b[32m', yellow:'\x1b[33m', red:'\x1b[31m', cyan:'\x1b[36m', gray:'\x1b[90m',
};

const NUM_NUMERIC_VARIANTS = 8;

function contentHash(content) {
  return crypto.createHash('sha256').update(JSON.stringify(content)).digest('hex');
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

function renderNumericVariant(card) {
  const { stem, params: paramDefs, answer_formula, precision = 2, unit = '', distractors } = card.content;
  const fmt = v => {
    const n = parseFloat(v.toFixed(precision));
    return unit ? `${n} ${unit}` : String(n);
  };

  for (let attempt = 0; attempt < 20; attempt++) {
    const params = sampleParams(paramDefs);
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
      rendered_stem:    fillTemplate(stem, params),
      rendered_options: options,
      correct_index:    options.indexOf(answerStr),
      correct_value:    answerVal,
      param_values:     params,
    };
  }
  return null;
}

async function importUnit(unitNum, cards) {
  console.log(`\n${C.bold}Unit ${unitNum}${C.reset} — ${cards.length} cards`);

  let cardInserted = 0, cardSkipped = 0, variantInserted = 0, errors = 0;
  const BATCH = 50;

  for (let i = 0; i < cards.length; i += BATCH) {
    const batch = cards.slice(i, i + BATCH);

    const sourceCardRows = batch.filter(card => card != null).map(card => ({
      subject:              card.subject,
      unit:                 card.unit,
      unit_exam_weight_pct: card.unit_exam_weight_pct,
      deck:                 card.deck,
      type:                 card.type,
      difficulty:           card.difficulty,
      tags:                 card.tags || [],
      source:               card.source || 'ced_generated',
      reviewed:             true,
      visual:               card.visual || null,
      content:              card.content,
      content_hash:         contentHash(card.content),
    }));

    // Upsert source_cards; ignoreDuplicates skips rows whose content_hash already exists
    const { data: inserted, error: cardError } = await supabase
      .from('source_cards')
      .upsert(sourceCardRows, { onConflict: 'content_hash', ignoreDuplicates: true })
      .select('id, content_hash, type');

    if (cardError) {
      console.error(`${C.red}  source_cards error: ${cardError.message}${C.reset}`);
      errors += batch.length;
      continue;
    }

    cardInserted += inserted ? inserted.length : 0;
    cardSkipped  += batch.length - (inserted ? inserted.length : 0);

    // Fetch IDs for all cards in this batch (both newly inserted and pre-existing)
    const hashes = sourceCardRows.map(r => r.content_hash);
    const { data: allCards } = await supabase
      .from('source_cards')
      .select('id, content_hash, type')
      .in('content_hash', hashes);

    if (!allCards) continue;

    const hashToCard = Object.fromEntries(allCards.map(sc => [sc.content_hash, sc]));

    // Build variant rows for mc_static cards only
    const variantCandidates = [];
    for (const row of sourceCardRows) {
      const sc = hashToCard[row.content_hash];
      if (!sc || sc.type !== 'mc_static') continue;
      const original = batch.find(c => contentHash(c.content) === row.content_hash);
      if (!original) continue;
      variantCandidates.push({
        source_card_id:   sc.id,
        rendered_stem:    original.content.stem,
        rendered_options: original.content.options,
        correct_index:    original.content.correct_index,
        correct_value:    null,
        param_values:     null,
      });
    }

    if (variantCandidates.length > 0) {
      // Skip source_card_ids that already have a variant
      const { data: existing } = await supabase
        .from('question_variants')
        .select('source_card_id')
        .in('source_card_id', variantCandidates.map(v => v.source_card_id));

      const alreadyDone = new Set((existing || []).map(v => v.source_card_id));
      const newVariants = variantCandidates.filter(v => !alreadyDone.has(v.source_card_id));

      if (newVariants.length > 0) {
        const { error: variantError } = await supabase
          .from('question_variants')
          .insert(newVariants);
        if (variantError) {
          console.error(`${C.red}  question_variants error: ${variantError.message}${C.reset}`);
        } else {
          variantInserted += newVariants.length;
        }
      }
    }

    // Build variant rows for mc_numeric cards (NUM_NUMERIC_VARIANTS param combos each)
    const numericCandidates = [];
    for (const row of sourceCardRows) {
      const sc = hashToCard[row.content_hash];
      if (!sc || sc.type !== 'mc_numeric') continue;
      const original = batch.find(c => contentHash(c.content) === row.content_hash);
      if (!original) continue;

      const seen = new Set();
      let generated = 0;
      for (let attempt = 0; attempt < NUM_NUMERIC_VARIANTS * 5 && generated < NUM_NUMERIC_VARIANTS; attempt++) {
        const v = renderNumericVariant(original);
        if (!v) continue;
        const key = JSON.stringify(v.param_values);
        if (seen.has(key)) continue;
        seen.add(key);
        numericCandidates.push({ source_card_id: sc.id, ...v });
        generated++;
      }
    }

    if (numericCandidates.length > 0) {
      const numericCardIds = [...new Set(numericCandidates.map(v => v.source_card_id))];
      const { data: existingNumeric } = await supabase
        .from('question_variants')
        .select('source_card_id')
        .in('source_card_id', numericCardIds);

      const alreadyDoneNumeric = new Set((existingNumeric || []).map(v => v.source_card_id));
      const newNumericVariants = numericCandidates.filter(v => !alreadyDoneNumeric.has(v.source_card_id));

      if (newNumericVariants.length > 0) {
        const { error: numericError } = await supabase
          .from('question_variants')
          .insert(newNumericVariants);
        if (numericError) {
          console.error(`${C.red}  question_variants (numeric) error: ${numericError.message}${C.reset}`);
        } else {
          variantInserted += newNumericVariants.length;
        }
      }
    }

    process.stdout.write(`  ${C.gray}batch ${Math.floor(i/BATCH)+1}/${Math.ceil(cards.length/BATCH)}${C.reset}\r`);
  }

  const mcStaticCount  = cards.filter(c => c != null && c.type === 'mc_static').length;
  const mcNumericCount = cards.filter(c => c != null && c.type === 'mc_numeric').length;
  console.log(`  source_cards:      ${C.green}+${cardInserted}${C.reset} inserted, ${cardSkipped} already existed`);
  console.log(`  question_variants: ${C.green}+${variantInserted}${C.reset} inserted (mc_static: ${mcStaticCount} eligible, mc_numeric: ${mcNumericCount} × ${NUM_NUMERIC_VARIANTS} variants)`);
  if (errors) console.log(`  ${C.red}${errors} errors${C.reset}`);
  return { cardInserted, variantInserted };
}

async function main() {
  console.log(`\n${C.bold}Studiem — Supabase Import${C.reset}`);
  console.log(`Target: ${SUPABASE_URL}\n`);

  const files = fs.readdirSync(CLEAN_DIR)
    .filter(f => /^unit\d+_clean\.json$/.test(f))
    .sort();

  if (files.length === 0) {
    console.error('No unit*_clean.json files found in content/apchem/');
    process.exit(1);
  }

  let totalCards = 0, totalVariants = 0;

  for (const file of files) {
    const unitNum = parseInt(file.match(/unit(\d+)/)[1], 10);
    let cards;
    try {
      cards = JSON.parse(fs.readFileSync(path.join(CLEAN_DIR, file), 'utf8'));
    } catch (e) {
      console.error(`${C.red}Failed to parse ${file}: ${e.message}${C.reset}`);
      continue;
    }
    const result = await importUnit(unitNum, cards);
    totalCards    += result.cardInserted;
    totalVariants += result.variantInserted;
  }

  console.log(`\n${C.bold}════════════════════════════════${C.reset}`);
  console.log(`${C.green}${C.bold}Import complete${C.reset}`);
  console.log(`  Total source_cards inserted:      ${totalCards}`);
  console.log(`  Total question_variants inserted: ${totalVariants}`);
  console.log(`${C.bold}════════════════════════════════${C.reset}\n`);
}

main().catch(err => {
  console.error(`${C.red}Fatal:${C.reset}`, err);
  process.exit(1);
});
