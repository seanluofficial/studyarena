#!/usr/bin/env node
'use strict';

require('dotenv').config();
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const Groq = require('groq-sdk');
const fs = require('fs');
const path = require('path');

// ─── Config ───────────────────────────────────────────────────────────────────

const BATCH_SIZE = 5;
const REPORTS_DIR = path.join(__dirname, '..', 'content', 'reports');
const PROMPTS_DIR = path.join(__dirname, '..', 'content', 'prompts');

const UNIT_NAMES = {
  1: 'Unit 1: Atomic Structure and Properties',
  2: 'Unit 2: Molecular and Ionic Compound Structure and Properties',
};

// AP Chemistry CED learning objectives per unit — used as the evaluation benchmark
const CED_OBJECTIVES = {
  1: `
UNIT 1: Atomic Structure and Properties — AP Chemistry CED Learning Objectives

1.1 Moles and Molar Mass
- SPQ-1.A: Calculate moles, number of particles, or mass using molar mass and Avogadro's number.
- SPQ-1.B: Explain the quantitative relationship between the mass of a substance and the number of particles it contains.

1.2 Mass Spectrometry of Elements
- SPQ-1.C: Explain how mass spectrometry data (m/z values and relative abundances) reveals isotopic composition and average atomic mass.

1.3 Elemental Composition of Pure Substances
- SPQ-2.A: Derive the empirical formula of a substance from percent composition by mass or experimental data.

1.4 Composition of Mixtures
- SPQ-2.B: Explain the quantitative relationship between composition and properties in a mixture.

1.5 Atomic Structure and Electron Configuration
- SAP-1.A: Write or identify the ground-state electron configuration of neutral atoms and common ions using subshell notation and noble-gas shorthand.
- SAP-1.B: Relate electron configuration to position in the periodic table (period, group, block).
- Note: Exceptions to the Aufbau principle (Cr, Cu, and their analogs) are testable.

1.6 Photoelectron Spectroscopy (PES)
- SAP-1.C: Interpret PES data: number of peaks = number of subshells, peak position (binding energy) indicates subshell type and nuclear attraction, peak intensity (relative height) is proportional to number of electrons in that subshell.

1.7 Periodic Trends
- SAP-2.A: Explain and predict trends in atomic radius, ionization energy, and electronegativity across periods and down groups.
- SAP-2.B: Explain anomalies in ionization energy (e.g., Al < Mg due to 3p vs 3s; S < P due to paired 3p electrons).
- Effective nuclear charge (Z_eff) and shielding are the underlying explanations.

1.8 Valence Electrons and Ionic Compounds
- SAP-2.C: Identify the number of valence electrons and the typical ionic charge for main-group elements.
- SAP-2.C: Explain why ionic compounds form between metals and nonmetals with large electronegativity differences.

SOLVABILITY RULES FOR UNIT 1:
- Molar mass calculations must provide or use standard atomic masses (or reference a known element).
- Isotope abundance problems must give at least masses and one abundance, or enough data to solve.
- PES questions must give enough peaks/intensities to identify the element or answer the question.
- Electron configuration questions must specify the element (by name, symbol, or atomic number).
- Periodic trend questions must compare real, named elements or clearly defined positions.
`,
  2: `
UNIT 2: Molecular and Ionic Compound Structure and Properties — AP Chemistry CED Learning Objectives

2.1 Types of Chemical Bonds
- SAP-3.A: Classify bonds as ionic, covalent, or metallic based on electronegativity differences and element types.
- SAP-3.A: Predict whether a bond is polar covalent or nonpolar covalent.

2.2 Intramolecular Force and Potential Energy
- SAP-3.B: Relate bond length, bond energy, and bond order (single < double < triple in terms of length; inverse in energy).

2.3 Structure of Ionic Solids
- SAP-3.C: Use Coulomb's law (F ∝ q₁q₂/r²) to compare lattice energies: higher charge magnitude or smaller ionic radii → higher lattice energy.

2.4 Structure of Metals and Alloys
- SAP-3.D: Describe metallic bonding as a "sea of electrons" model; explain conductivity, malleability, and ductility.

2.5 Lewis Diagrams
- SAP-4.A: Draw Lewis structures for molecules and polyatomic ions satisfying the octet rule (with exceptions: expanded octets for Period 3+, electron-deficient species like BF₃).
- SAP-4.A: Determine the number of bonding and lone pairs on each atom.

2.6 Resonance and Formal Charge
- SAP-4.B: Identify resonance structures and explain that the actual structure is a hybrid (intermediate bond length/order).
- SAP-4.C: Calculate formal charge: FC = valence e⁻ − nonbonding e⁻ − ½(bonding e⁻). Select the Lewis structure that minimizes formal charges.

2.7 VSEPR and Bond Hybridization
- SAP-4.D: Use VSEPR to predict electron geometry and molecular geometry; know that lone pairs compress bond angles more than bonding pairs.
- SAP-4.D: Predict molecular polarity from geometry and bond dipoles (polar if dipoles don't cancel).
- SAP-4.E: Assign hybridization: 2 domains = sp, 3 domains = sp², 4 domains = sp³, 5 domains = sp³d, 6 domains = sp³d².
- Common molecular geometries and bond angles: linear 180°, trigonal planar 120°, tetrahedral 109.5°, trigonal pyramidal ~107°, bent ~104.5°.

SOLVABILITY RULES FOR UNIT 2:
- Lewis structure questions must name the molecule or ion unambiguously.
- VSEPR questions must specify the molecule or provide enough data to determine it.
- Lattice energy comparisons must name the compounds or give ionic charges and radii.
- Formal charge questions must specify which atom and which Lewis structure to use.
- Bond type questions must name or clearly describe both elements.
`,
};

const UNIT_DECKS = {
  1: [
    'Moles and Molar Mass',
    'Mass Spectrometry of Elements',
    'Elemental Composition of Pure Substances',
    'Composition of Mixtures',
    'Atomic Structure and Electron Configuration',
    'Photoelectron Spectroscopy',
    'Periodic Trends',
    'Valence Electrons and Ionic Compounds',
  ],
  2: [
    'Types of Chemical Bonds',
    'Intramolecular Force and Potential Energy',
    'Structure of Ionic Solids',
    'Structure of Metals and Alloys',
    'Lewis Diagrams',
    'Resonance and Formal Charge',
    'VSEPR and Bond Hybridization',
  ],
};

const UNIT_EXAM_WEIGHT = { 1: 9, 2: 9 };

// ─── Generation prompt ────────────────────────────────────────────────────────

function saveGenerationPrompt(unit, totalNeeded, alreadyHave) {
  fs.mkdirSync(PROMPTS_DIR, { recursive: true });

  const batchSize = Math.min(50, totalNeeded);
  const nMcStatic  = Math.round(batchSize * 0.50);
  const nMcNumeric = Math.round(batchSize * 0.30);
  const nFrStatic  = Math.round(batchSize * 0.15);
  const nFrNumeric = batchSize - nMcStatic - nMcNumeric - nFrStatic;

  const unitName   = UNIT_NAMES[unit];
  const examWeight = UNIT_EXAM_WEIGHT[unit];
  const decks      = UNIT_DECKS[unit].join(', ');

  const prompt = `\
SYSTEM PROMPT
─────────────
You are an expert AP exam question author. You write questions in strict JSON format matching the Studiem source card schema. Every card you produce must be:
- Accurate to the AP Chemistry curriculum as described in the CED for ${unitName}
- Varied in difficulty (roughly 40% easy, 40% medium, 20% hard per batch)
- For mc_numeric and fr_numeric types: the answer_formula and distractor formulas must be valid math expressions using only the param variable names and numeric literals
- For mc_numeric: all 3 distractor formulas must produce values different from the correct answer for all param combinations in the defined ranges
- For fr_static: accepted_answers must be lowercase

Output a JSON array of exactly ${batchSize} source card objects. No commentary, no markdown fences — raw JSON array only.

─────────────────────────────────────────────────────────────────────────────

USER PROMPT
───────────
Generate ${batchSize} source cards for AP Chemistry — ${unitName} (exam weight: ${examWeight}%).

Quantity breakdown:
- ${nMcStatic} mc_static cards (conceptual, definition, identification — no numbers)
- ${nMcNumeric} mc_numeric cards (calculation-based with randomized parameters)
- ${nFrStatic} fr_static cards (short free-response text answer, 1–3 words)
- ${nFrNumeric} fr_numeric card${nFrNumeric !== 1 ? 's' : ''} (computed free-response numeric answer)

Distribute questions evenly across these decks: ${decks}.

Target question count context: I already have ${alreadyHave} passing questions for this unit and need ${totalNeeded} more to reach 90 total. Do not repeat concepts already covered at basic level — prefer medium/hard depth on topics that have easy questions.

Each card must follow this exact schema:

{
  "subject": "AP Chemistry",
  "unit": "${unitName}",
  "unit_exam_weight_pct": ${examWeight},
  "deck": "<one of the deck names listed above>",
  "type": "mc_static" | "mc_numeric" | "fr_static" | "fr_numeric",
  "difficulty": "easy" | "medium" | "hard",
  "tags": ["snake_case_concept_tag", ...],
  "source": "ced_generated",
  "reviewed": false,
  "visual": null,
  "content": { ... }
}

Content schema by type:

mc_static:
  "content": {
    "stem": "Question text ending with a question mark.",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correct_index": 0
  }

mc_numeric:
  "content": {
    "stem": "Question stem with {{a}} and {{b}} placeholders for randomized values.",
    "params": {
      "a": { "min": 1.0, "max": 5.0, "step": 0.5 },
      "b": { "min": 2,   "max": 8,   "step": 1   }
    },
    "answer_formula": "a / b",
    "precision": 2,
    "unit": "M",
    "distractors": [
      { "formula": "a * b",  "error_type": "multiplied_instead_of_divided" },
      { "formula": "a + b",  "error_type": "added_instead_of_divided" },
      { "formula": "b / a",  "error_type": "inverted_ratio" }
    ]
  }

fr_static:
  "content": {
    "stem": "Question stem.",
    "accepted_answers": ["correct answer in lowercase", "alternate spelling if any"],
    "semantic_fallback": true
  }

fr_numeric:
  "content": {
    "stem": "Question stem with {{a}} placeholder.",
    "params": { "a": { "min": 10, "max": 100, "step": 5 } },
    "answer_formula": "a * 4.18",
    "precision": 1,
    "unit": "J",
    "tolerance": 0.05,
    "semantic_fallback": false
  }

Rules:
- options array must have exactly 4 items for mc_static
- distractors array must have exactly 3 items for mc_numeric
- All {{variable}} names in stem must match keys in params
- answer_formula and distractor formulas use only param names and numeric literals (valid mathjs expressions)
- Do NOT use "all of the above", "none of the above", or "both A and B" as options
- correct_index is 0-based (0, 1, 2, or 3)
- accepted_answers strings must be lowercase

Output a raw JSON array of exactly ${batchSize} cards. No markdown fences, no commentary, no explanation — just the JSON array starting with [ and ending with ].
`;

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `apchem_unit${unit}_generation_prompt_${timestamp}.txt`;
  const outPath = path.join(PROMPTS_DIR, filename);
  fs.writeFileSync(outPath, prompt, 'utf8');
  return outPath;
}

// ─── CLI args ─────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { unit: null, file: null, dir: null, batchSize: BATCH_SIZE };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--unit') opts.unit = parseInt(args[++i], 10);
    else if (args[i] === '--file') opts.file = path.resolve(args[++i]);
    else if (args[i] === '--dir') opts.dir = path.resolve(args[++i]);
    else if (args[i] === '--batch-size') opts.batchSize = parseInt(args[++i], 10);
  }

  if (!opts.unit || opts.unit < 1 || opts.unit > 9) {
    console.error('Usage: node validator_agent.js --unit [1-9] --file <path> [--batch-size N]');
    console.error('       node validator_agent.js --unit [1-9] --dir <path>');
    process.exit(1);
  }
  if (!opts.file && !opts.dir) {
    console.error('Error: must provide --file or --dir');
    process.exit(1);
  }

  return opts;
}

// ─── File loading ─────────────────────────────────────────────────────────────

function parseJsonFile(filePath) {
  let text = fs.readFileSync(filePath, 'utf8');
  // Strip UTF-8 BOM if present
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  // Strip markdown code fences if the AI wrapped the output
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  try {
    return JSON.parse(text);
  } catch (err) {
    console.error(`${'\x1b[31m'}JSON parse error in ${filePath}: ${err.message}${'\x1b[0m'}`);
    console.error(`First 120 chars: ${text.slice(0, 120)}`);
    console.error(`Last  120 chars: ${text.slice(-120)}`);
    throw err;
  }
}

function loadQuestions(opts) {
  const files = opts.file
    ? [opts.file]
    : fs.readdirSync(opts.dir).filter(f => f.endsWith('.json')).map(f => path.join(opts.dir, f));

  const questions = [];
  for (const f of files) {
    const raw = parseJsonFile(f);
    const arr = Array.isArray(raw) ? raw : [raw];
    for (const q of arr) questions.push({ ...q, _sourcePath: f });
  }
  return questions;
}

// ─── Schema validation ────────────────────────────────────────────────────────

function schemaCheck(q) {
  const issues = [];
  const c = q.content;

  if (!c) return ['missing content field'];
  if (!q.type) issues.push('missing type');
  if (!['easy', 'medium', 'hard'].includes(q.difficulty)) issues.push(`invalid difficulty: "${q.difficulty}"`);

  if (q.type === 'mc_static' || q.type === 'mc_numeric') {
    if (!c.stem) issues.push('missing stem');
    if (!Array.isArray(c.options) || c.options.length !== 4)
      issues.push(`options must be array of 4 (got ${Array.isArray(c.options) ? c.options.length : 'missing'})`);
    if (typeof c.correct_index !== 'number' || c.correct_index < 0 || c.correct_index > 3)
      issues.push(`correct_index must be 0–3 (got ${c.correct_index})`);
    if (Array.isArray(c.options) && new Set(c.options).size !== c.options.length)
      issues.push('duplicate options');
    if (Array.isArray(c.options)) {
      for (const opt of c.options) {
        if (['all of the above', 'none of the above', 'both a and b'].some(b => opt.toLowerCase().includes(b)))
          issues.push(`forbidden option text: "${opt.slice(0, 40)}"`);
      }
    }
  }

  if (q.type === 'mc_numeric') {
    if (!c.params) issues.push('missing params');
    if (!c.answer_formula) issues.push('missing answer_formula');
    if (!Array.isArray(c.distractors) || c.distractors.length !== 3) issues.push('need exactly 3 distractors');
    if (c.stem && c.params) {
      for (const param of Object.keys(c.params)) {
        if (!c.stem.includes(`{{${param}}}`)) issues.push(`{{${param}}} not referenced in stem`);
      }
    }
  }

  if (q.type === 'fr_static') {
    if (!c.stem) issues.push('missing stem');
    if (!Array.isArray(c.accepted_answers) || c.accepted_answers.length === 0) issues.push('missing accepted_answers');
  }

  return issues;
}

// ─── Prompt building ──────────────────────────────────────────────────────────

function formatQuestionForPrompt(q, absIndex) {
  const c = q.content;
  let text = `[Q${absIndex + 1}] type=${q.type} difficulty=${q.difficulty}\nStem: ${c.stem}\n`;

  if (q.type === 'mc_static' || q.type === 'mc_numeric') {
    c.options.forEach((opt, i) => {
      text += `  ${i === c.correct_index ? '✓' : ' '}${i}. ${opt}\n`;
    });
  }
  if (q.type === 'mc_numeric') {
    text += `Params: ${JSON.stringify(c.params)}\n`;
    text += `Answer formula: ${c.answer_formula}\n`;
    text += `Distractors: ${c.distractors.map(d => d.formula).join(' | ')}\n`;
  }
  if (q.type === 'fr_static') {
    text += `Accepted answers: ${(c.accepted_answers || []).join(', ')}\n`;
  }
  return text;
}

function buildSystemPrompt(unit) {
  return `You are a strict AP Chemistry question validator. Your only reference is the official AP Chemistry Course and Exam Description (CED). Do not use outside knowledge beyond standard AP Chemistry content.

${CED_OBJECTIVES[unit]}

---

## Your Two-Part Job

### Part 1 — Solvability
Can a student with only AP Chemistry Unit ${unit} knowledge definitively solve this question? Ask:
- Is the correct answer derivable from information given in the stem alone (no outside knowledge needed beyond the CED)?
- For mc_numeric: does the answer_formula produce a unique, correct numeric result from the given params?
- Is there exactly ONE unambiguously correct answer among the options?
- Would a student who has fully mastered Unit ${unit} always reach the same answer?

### Part 2 — Quality
Is this question worth asking on an AP Chemistry exam?
- Does it test a specific CED learning objective for Unit ${unit} (not trivia, not rote memorization)?
- Are the wrong answers plausible errors a real AP student might make?
- Is the stem clear, precise, and unambiguous?
- Does the difficulty label (easy/medium/hard) match the actual cognitive demand?

---

## Scoring (1–10 each)

- **solvable**: Can the question be definitively solved with Unit ${unit} AP Chem knowledge? (1 = unsolvable/ambiguous, 10 = clearly solvable)
- **factual_accuracy**: Is the marked correct answer provably correct, and are all distractors wrong? (A factual error = ≤4)
- **curriculum_fit**: Does this align with a named CED learning objective for Unit ${unit}? (Tests trivial recall or off-unit content = ≤4)
- **distractor_quality**: Are wrong answers plausible mistakes a real student would make?
- **clarity**: Is the stem precise? Could a student misinterpret what is being asked?

## Verdict

- **PASS**: solvable ≥ 8 AND factual_accuracy ≥ 8 AND curriculum_fit ≥ 7 AND distractor_quality ≥ 6 AND clarity ≥ 6
- **FLAG**: solvable 6–7 OR factual_accuracy 6–7 OR curriculum_fit 5–6 OR any other score 4–5
- **FAIL**: solvable ≤ 5 OR factual_accuracy ≤ 5 OR curriculum_fit ≤ 4

Be strict on solvability. If the stem is missing data needed to solve it, or the answer formula is mathematically invalid, that is an automatic FAIL on solvable.

## Output format

Return a JSON object with key "results" — array with one entry per question:
{
  "results": [
    {
      "index": <0-based, matching Q number minus 1>,
      "verdict": "PASS" | "FLAG" | "FAIL",
      "scores": {
        "solvable": <1-10>,
        "factual_accuracy": <1-10>,
        "curriculum_fit": <1-10>,
        "distractor_quality": <1-10>,
        "clarity": <1-10>
      },
      "issues": ["describe each specific problem"],
      "corrected_correct_index": null or 0-3,
      "notes": "one-line summary"
    }
  ]
}`;
}

// ─── API call ─────────────────────────────────────────────────────────────────

async function evaluateBatch(client, systemPrompt, batch, batchOffset) {
  const userContent = batch.map((q, i) => formatQuestionForPrompt(q, batchOffset + i)).join('\n\n---\n\n');

  const completion = await client.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    temperature: 0.1,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Evaluate these ${batch.length} AP Chemistry question(s):\n\n${userContent}` },
    ],
  });

  const parsed = JSON.parse(completion.choices[0].message.content.trim());
  const arr = Array.isArray(parsed) ? parsed : (parsed.results ?? Object.values(parsed)[0]);
  if (!Array.isArray(arr)) throw new Error(`Unexpected response shape: ${JSON.stringify(parsed).slice(0, 200)}`);
  return arr;
}

// ─── Clean file output ────────────────────────────────────────────────────────

function saveCleanFile(questions, allResults, opts) {
  const passedIndexes = new Set(allResults.filter(r => r.verdict === 'PASS').map(r => r.index));
  const clean = questions
    .filter((_, i) => passedIndexes.has(i))
    .map(({ _sourcePath, ...q }) => q);

  let outPath;
  if (opts.file) {
    const ext = path.extname(opts.file);
    outPath = opts.file.slice(0, -ext.length) + '_clean' + ext;
  } else {
    outPath = path.join(opts.dir, `unit${opts.unit}_clean.json`);
  }

  fs.writeFileSync(outPath, JSON.stringify(clean, null, 2));
  return { outPath, count: clean.length };
}

// ─── Report writing ───────────────────────────────────────────────────────────

function writeReport(allResults, questions, schemaRemovedCount, unit, opts) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const reportPath = path.join(REPORTS_DIR, `apchem_unit${unit}_validation_${timestamp}.json`);

  fs.writeFileSync(reportPath, JSON.stringify({
    generated_at: new Date().toISOString(),
    unit,
    unit_name: UNIT_NAMES[unit],
    source: opts.file || opts.dir,
    original_count: questions.length,
    schema_removed: schemaRemovedCount,
    results: allResults.map(r => ({
      ...r,
      stem_preview: questions[r.index]?.content?.stem?.slice(0, 120),
      difficulty: questions[r.index]?.difficulty,
      type: questions[r.index]?.type,
    })),
  }, null, 2));

  return reportPath;
}

// ─── Console ──────────────────────────────────────────────────────────────────

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m',
  green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', cyan: '\x1b[36m', gray: '\x1b[90m',
};

function printProgress(batchNum, total, results) {
  const icons = { PASS: `${C.green}✓${C.reset}`, FLAG: `${C.yellow}⚑${C.reset}`, FAIL: `${C.red}✗${C.reset}` };
  process.stdout.write(`Batch ${batchNum}/${total}: ${results.map(r => icons[r.verdict]).join(' ')}\n`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs();

  if (!process.env.GROQ_API_KEY) {
    console.error(`${C.red}Error: GROQ_API_KEY not set in scripts/.env${C.reset}`);
    console.error('Get a free key at: https://console.groq.com/keys');
    process.exit(1);
  }

  const client = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const allQuestions = loadQuestions(opts);
  const systemPrompt = buildSystemPrompt(opts.unit);

  console.log(`\n${C.bold}Studiem Validator Agent${C.reset}`);
  console.log(`Unit: ${UNIT_NAMES[opts.unit]}`);
  console.log(`Questions loaded: ${allQuestions.length}`);
  console.log(`Evaluation basis: AP Chemistry CED learning objectives`);

  // ── Step 1: Schema filter (no AI needed for broken questions) ──────────────
  const schemaFailed = [];
  const validQueue = [];

  for (let i = 0; i < allQuestions.length; i++) {
    const issues = schemaCheck(allQuestions[i]);
    if (issues.length > 0) {
      schemaFailed.push({ index: i, issues });
      console.log(`${C.red}[Schema] Q${i + 1}: ${issues.join(', ')}${C.reset}`);
    } else {
      validQueue.push({ q: allQuestions[i], originalIndex: i });
    }
  }

  if (schemaFailed.length > 0) {
    console.log(`${C.red}\nAuto-removed ${schemaFailed.length} questions with schema errors.\n${C.reset}`);
  }

  // ── Step 2: AI quality evaluation ─────────────────────────────────────────
  const aiResults = [];
  const totalBatches = Math.ceil(validQueue.length / opts.batchSize);
  console.log(`Evaluating ${validQueue.length} questions in ${totalBatches} batch(es)...\n`);

  for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
    const start = batchIdx * opts.batchSize;
    const batch = validQueue.slice(start, start + opts.batchSize);
    const origIndexes = batch.map(b => b.originalIndex);

    let batchResults = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        batchResults = await evaluateBatch(client, systemPrompt, batch.map(b => b.q), start);
        break;
      } catch (err) {
        if (attempt === 3) {
          console.error(`${C.red}Batch ${batchIdx + 1} failed: ${err.message}${C.reset}`);
          batchResults = batch.map((_, i) => ({
            index: i,
            verdict: 'FLAG',
            scores: { solvable: 0, factual_accuracy: 0, curriculum_fit: 0, distractor_quality: 0, clarity: 0 },
            issues: [`API error: ${err.message}`],
            corrected_correct_index: null,
            notes: 'Evaluation failed — needs manual review',
          }));
        } else {
          console.log(`${C.yellow}Attempt ${attempt} failed, retrying in ${attempt * 2}s...${C.reset}`);
          await new Promise(r => setTimeout(r, attempt * 2000));
        }
      }
    }

    // Map batch-relative indexes back to original file indexes
    for (let i = 0; i < batchResults.length; i++) {
      const rel = batchResults[i].index ?? i;
      batchResults[i].index = origIndexes[rel] ?? origIndexes[i];
    }

    aiResults.push(...batchResults);
    printProgress(batchIdx + 1, totalBatches, batchResults);

    if (batchIdx < totalBatches - 1) await new Promise(r => setTimeout(r, 500));
  }

  // ── Step 3: Merge schema failures into full result set ────────────────────
  const allResults = [
    ...schemaFailed.map(s => ({
      index: s.index,
      verdict: 'FAIL',
      scores: { solvable: 0, factual_accuracy: 0, curriculum_fit: 0, distractor_quality: 0, clarity: 0 },
      issues: s.issues,
      corrected_correct_index: null,
      notes: 'Schema validation failed',
    })),
    ...aiResults,
  ].sort((a, b) => a.index - b.index);

  // ── Step 4: Save clean file and report ────────────────────────────────────
  const { outPath, count: cleanCount } = saveCleanFile(allQuestions, allResults, opts);
  const reportPath = writeReport(allResults, allQuestions, schemaFailed.length, opts.unit, opts);

  // ── Step 5: Print summary ─────────────────────────────────────────────────
  const aiPassed  = aiResults.filter(r => r.verdict === 'PASS').length;
  const aiFlagged = aiResults.filter(r => r.verdict === 'FLAG').length;
  const aiFailed  = aiResults.filter(r => r.verdict === 'FAIL').length;

  console.log(`\n${C.bold}════════════════════════════════${C.reset}`);
  console.log(`  Original:            ${allQuestions.length}`);
  console.log(`${C.red}  Removed (schema):    ${schemaFailed.length}${C.reset}`);
  console.log(`${C.red}  Removed (AI FAIL):   ${aiFailed}${C.reset}`);
  console.log(`${C.yellow}  Removed (AI FLAG):   ${aiFlagged}${C.reset}`);
  console.log(`${C.bold}  ────────────────────────────${C.reset}`);
  console.log(`${C.green}${C.bold}  Kept in clean file:  ${cleanCount}${C.reset}`);
  console.log(`${C.bold}════════════════════════════════${C.reset}`);
  console.log(`\nClean file → ${C.cyan}${outPath}${C.reset}`);
  console.log(`Report     → ${C.gray}${reportPath}${C.reset}`);

  if (cleanCount < 90) {
    const needed = 90 - cleanCount;
    console.log(`\n${C.yellow}⚠  Need ${needed} more questions to reach the 90-question target for Unit ${opts.unit}.${C.reset}`);
    const promptPath = saveGenerationPrompt(opts.unit, needed, cleanCount);
    console.log(`\n${C.bold}Generation prompt saved:${C.reset}`);
    console.log(`${C.cyan}${promptPath}${C.reset}`);
    console.log(`${C.gray}Open this file, copy the contents, and paste into claude.ai or any AI model.${C.reset}`);
    console.log(`${C.gray}Save the output as a .json file in content/raw/, then re-run the validator.${C.reset}`);
  } else {
    console.log(`\n${C.green}✓  Unit ${opts.unit} target met (${cleanCount} ≥ 90).${C.reset}`);
  }

  console.log('');
  process.exit(aiFailed + schemaFailed.length > 0 ? 1 : 0);
}

main().catch(err => {
  console.error(`${C.red}Fatal:${C.reset}`, err);
  process.exit(1);
});
