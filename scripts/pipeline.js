#!/usr/bin/env node
'use strict';

require('dotenv').config();
// Windows: Node's bundled CA store may not include the intermediate cert for api.groq.com
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const Groq = require('groq-sdk');
const fs = require('fs');
const path = require('path');

// ─── Shared constants (duplicated from validator_agent.js to keep scripts independent) ───

const UNIT_NAMES = {
  1: 'Unit 1: Atomic Structure and Properties',
  2: 'Unit 2: Molecular and Ionic Compound Structure and Properties',
  3: 'Unit 3: Intermolecular Forces and Properties',
  4: 'Unit 4: Chemical Reactions',
  5: 'Unit 5: Kinetics',
  6: 'Unit 6: Thermodynamics',
  7: 'Unit 7: Equilibrium',
  8: 'Unit 8: Acids and Bases',
  9: 'Unit 9: Applications of Thermodynamics',
};
const UNIT_EXAM_WEIGHT = { 1: 9, 2: 9, 3: 20, 4: 8, 5: 8, 6: 8, 7: 8, 8: 13, 9: 8 };
const UNIT_DECKS = {
  1: ['Moles and Molar Mass','Mass Spectrometry of Elements','Elemental Composition of Pure Substances','Composition of Mixtures','Atomic Structure and Electron Configuration','Photoelectron Spectroscopy','Periodic Trends','Valence Electrons and Ionic Compounds'],
  2: ['Types of Chemical Bonds','Intramolecular Force and Potential Energy','Structure of Ionic Solids','Structure of Metals and Alloys','Lewis Diagrams','Resonance and Formal Charge','VSEPR and Bond Hybridization'],
  3: ['Intermolecular Forces','Properties of Solids','Solubility','Spectroscopy and the Electromagnetic Spectrum','Photoelectric Effect','Beer-Lambert Law'],
  4: ['Introduction to Reactions','Net Ionic Equations','Representations of Reactions','Physical and Chemical Changes','Stoichiometry','Introduction to Titration','Types of Chemical Reactions'],
  5: ['Reaction Rate','Introduction to Rate Law','Concentration Changes Over Time','Elementary Reactions','Collision Model','Reaction Energy Profile','Catalysis'],
  6: ['Endothermic and Exothermic Processes','Heat Transfer and Thermal Equilibrium','Heat Capacity and Calorimetry','Energy of Phase Changes','Introduction to Enthalpy of Reaction','Enthalpy of Formation','Hess\'s Law'],
  7: ['Introduction to Equilibrium','Calculating the Equilibrium Constant','Calculating Equilibrium Concentrations','Introduction to Le Chatelier\'s Principle','Introduction to Solubility Equilibria','Common-Ion Effect','pH and Solubility'],
  8: ['Introduction to Acids and Bases','pH and pOH of Strong Acids and Bases','Weak Acid and Base Equilibria','Acid-Base Reactions and Buffers','Acid-Base Titrations','Molecular Structure of Acids and Bases','pH and pKa'],
  9: ['Introduction to Entropy','Absolute Entropy and Entropy Change','Gibbs Free Energy and Thermodynamic Favorability','Thermodynamic and Kinetic Control','Free Energy and Equilibrium','Galvanic (Voltaic) Cells','Electrochemistry and the Nernst Equation'],
};
const CED_OBJECTIVES = {
  1: `
UNIT 1: Atomic Structure and Properties — AP Chemistry CED Learning Objectives

1.1 Moles and Molar Mass
- SPQ-1.A: Calculate moles, particles, or mass using molar mass and Avogadro's number.
- SPQ-1.B: Explain the quantitative relationship between mass and number of particles.

1.2 Mass Spectrometry of Elements
- SPQ-1.C: Explain how m/z values and relative abundances reveal isotopic composition and average atomic mass.

1.3 Elemental Composition of Pure Substances
- SPQ-2.A: Derive the empirical formula from percent composition or experimental data.

1.4 Composition of Mixtures
- SPQ-2.B: Explain the quantitative relationship between composition and properties in a mixture.

1.5 Atomic Structure and Electron Configuration
- SAP-1.A: Write ground-state electron configurations using subshell notation and noble-gas shorthand.
- SAP-1.B: Relate configuration to periodic table position. Exceptions: Cr, Cu, and analogs.

1.6 Photoelectron Spectroscopy (PES)
- SAP-1.C: Interpret PES: peaks = subshells, position = binding energy, height = electron count.

1.7 Periodic Trends
- SAP-2.A/B: Predict and explain trends in atomic radius, IE, and electronegativity. Know anomalies (Al<Mg, S<P).

1.8 Valence Electrons and Ionic Compounds
- SAP-2.C: Identify valence electrons, typical ionic charges, and explain ionic bond formation.
`,
  2: `
UNIT 2: Molecular and Ionic Compound Structure and Properties — AP Chemistry CED Learning Objectives

2.1 Types of Chemical Bonds
- SAP-3.A: Classify bonds as ionic, covalent, or metallic; predict polarity from electronegativity.

2.2 Intramolecular Force and Potential Energy
- SAP-3.B: Relate bond length, bond energy, and bond order.

2.3 Structure of Ionic Solids
- SAP-3.C: Use Coulomb's law to compare lattice energies (higher charge, smaller radii = higher energy).

2.4 Structure of Metals and Alloys
- SAP-3.D: Explain metallic properties using the sea-of-electrons model.

2.5 Lewis Diagrams
- SAP-4.A: Draw Lewis structures satisfying the octet rule (exceptions: expanded octets, electron-deficient).

2.6 Resonance and Formal Charge
- SAP-4.B/C: Identify resonance; calculate FC = valence e⁻ − nonbonding e⁻ − ½(bonding e⁻).

2.7 VSEPR and Bond Hybridization
- SAP-4.D/E: Predict geometry, bond angles, polarity from VSEPR; assign hybridization (sp, sp², sp³, sp³d, sp³d²).
`,
  3: `
UNIT 3: Intermolecular Forces and Properties — AP Chemistry CED Learning Objectives

3.1 Intermolecular Forces
- SAP-5.A: Explain the relationship between intermolecular forces (London dispersion, dipole-dipole, hydrogen bonding) and the relative boiling points, melting points, and vapor pressures of substances.
- SAP-5.B: Explain the relationship between the structure of a molecule and the intermolecular forces it exhibits.

3.2 Properties of Solids
- SAP-6.A: Explain the relationship between macroscopic properties of a solid (hardness, conductivity, melting point) and the type of solid (ionic, metallic, molecular, network covalent).

3.3 Solubility
- SAP-7.A: Explain the relationship between the solubility of ionic and molecular compounds using "like dissolves like" and IMF strength.
- SAP-7.B: Explain the relationship between molecular structure, polarity, and solubility.

3.4 Spectroscopy and the Electromagnetic Spectrum
- SAP-8.A: Explain how absorption/emission spectra provide evidence for quantized energy levels.
- SAP-8.B: Relate the energy of a photon to its frequency and wavelength using E = hf = hc/λ.

3.5 Photoelectric Effect
- SAP-8.C: Explain the photoelectric effect as evidence for the particle nature of light; identify threshold frequency and kinetic energy of emitted electrons.

3.6 Beer-Lambert Law
- SPQ-3.A: Explain the relationships among absorbance, concentration, path length, and molar absorptivity (A = εlc).
- SPQ-3.B: Use Beer-Lambert law to determine concentration from absorbance data.
`,
  4: `
UNIT 4: Chemical Reactions — AP Chemistry CED Learning Objectives

4.1 Introduction to Reactions
- TRA-1.A: Identify evidence for chemical reactions (color change, gas, precipitate, temperature change, light).

4.2 Net Ionic Equations
- TRA-1.B: Represent a precipitation reaction with a net ionic equation; identify spectator ions.

4.3 Representations of Reactions
- TRA-1.C: Represent a reaction using particulate diagrams, symbolic equations, and graphical forms (all must be consistent).

4.4 Physical and Chemical Changes
- TRA-1.D: Distinguish between physical and chemical changes based on conservation of matter.

4.5 Stoichiometry
- SPQ-4.A: Calculate the amount (moles, mass, volume) of product or reactant using stoichiometric relationships; identify limiting reagent; calculate percent yield.

4.6 Introduction to Titration
- SPQ-4.B: Determine concentration of a solution using titration data; identify the equivalence point.

4.7 Types of Chemical Reactions
- TRA-2.A: Identify and classify reactions as acid-base, precipitation, or oxidation-reduction; assign oxidation states; identify oxidizing and reducing agents.
`,
  5: `
UNIT 5: Kinetics — AP Chemistry CED Learning Objectives

5.1 Reaction Rate
- TRA-3.A: Express reaction rate as a change in concentration over time; relate rates of consumption and production for different species using stoichiometry.

5.2 Introduction to Rate Law
- TRA-3.B: Write a rate law expression; determine the order with respect to each reactant from experimental data; calculate the rate constant k with appropriate units.

5.3 Concentration Changes Over Time
- TRA-3.C: Use integrated rate laws (zero, first, second order) to relate concentration to time; determine half-life.

5.4 Elementary Reactions
- TRA-4.A: Identify molecularity of elementary steps; write a rate law for an elementary step directly from its stoichiometry.

5.5 Collision Model
- TRA-4.B: Explain how temperature, concentration, surface area, and orientation affect reaction rate using collision theory; apply the Arrhenius equation.

5.6 Reaction Energy Profile
- TRA-4.C: Interpret an energy profile (activation energy, ΔH, transition state, intermediates); identify the rate-determining step in a mechanism.

5.7 Catalysis
- TRA-4.D: Explain how a catalyst increases reaction rate by providing an alternative pathway with lower Ea; distinguish homogeneous from heterogeneous catalysis.
`,
  6: `
UNIT 6: Thermodynamics — AP Chemistry CED Learning Objectives

6.1 Endothermic and Exothermic Processes
- ENE-1.A: Classify a process as endothermic or exothermic; explain energy flow using sign conventions for q and ΔH.

6.2 Heat Transfer and Thermal Equilibrium
- ENE-1.B: Explain heat transfer between objects at different temperatures in terms of molecular collisions until thermal equilibrium.

6.3 Heat Capacity and Calorimetry
- ENE-1.C: Calculate heat using q = mcΔT; use coffee-cup or bomb calorimetry data to determine ΔH.

6.4 Energy of Phase Changes
- ENE-2.A: Explain the energy changes associated with phase transitions (melting, vaporization) in terms of IMF.

6.5 Introduction to Enthalpy of Reaction
- ENE-2.B: Calculate ΔH using bond enthalpies or from calorimetry data; explain the sign of ΔH.

6.6 Enthalpy of Formation
- ENE-2.C: Calculate ΔH°rxn from standard enthalpies of formation using ΔH°rxn = Σ ΔH°f(products) − Σ ΔH°f(reactants).

6.7 Hess's Law
- ENE-2.D: Calculate ΔH for a target reaction by combining and manipulating thermochemical equations using Hess's law.
`,
  7: `
UNIT 7: Equilibrium — AP Chemistry CED Learning Objectives

7.1 Introduction to Equilibrium
- TRA-7.A: Explain that at equilibrium, forward and reverse reaction rates are equal; the concentrations of reactants and products are constant but not necessarily equal.

7.2 Calculating the Equilibrium Constant
- TRA-7.B: Write the equilibrium constant expression K (Kc or Kp) for a given reaction; calculate K from equilibrium concentrations or pressures.

7.3 Calculating Equilibrium Concentrations
- TRA-8.A: Use an ICE table to determine equilibrium concentrations or pressures from initial conditions and K.

7.4 Introduction to Le Chatelier's Principle
- TRA-9.A: Predict the direction of equilibrium shift in response to a stress (concentration change, pressure change, temperature change, addition of inert gas) using Le Chatelier's principle.

7.5 Introduction to Solubility Equilibria
- TRA-10.A: Write Ksp expressions; calculate Ksp from solubility or solubility from Ksp; predict precipitation using Q vs. Ksp.

7.6 Common-Ion Effect
- TRA-10.B: Explain how the presence of a common ion decreases the solubility of a slightly soluble salt.

7.7 pH and Solubility
- TRA-10.C: Explain how pH affects solubility of salts containing basic anions.
`,
  8: `
UNIT 8: Acids and Bases — AP Chemistry CED Learning Objectives

8.1 Introduction to Acids and Bases
- TRA-12.A: Identify Brønsted-Lowry acids, bases, and conjugate acid-base pairs; identify Lewis acids and bases.

8.2 pH and pOH of Strong Acids and Bases
- TRA-12.B: Calculate pH and pOH for strong acid and strong base solutions; use Kw = [H⁺][OH⁻] = 1×10⁻¹⁴ at 25°C.

8.3 Weak Acid and Base Equilibria
- TRA-13.A: Write Ka and Kb expressions; use ICE tables to calculate pH of weak acid/base solutions; relate Ka and Kb using KaKb = Kw.

8.4 Acid-Base Reactions and Buffers
- TRA-14.A: Explain how a buffer resists pH change; use the Henderson-Hasselbalch equation (pH = pKa + log([A⁻]/[HA])) to calculate buffer pH.

8.5 Acid-Base Titrations
- TRA-15.A: Sketch and interpret a titration curve; identify the equivalence point; determine Ka or Kb from half-equivalence point pH; identify the species present at each stage.

8.6 Molecular Structure of Acids and Bases
- TRA-12.C: Predict relative acid strength from molecular structure: electronegativity, bond polarity, bond length, and number of oxygen atoms on oxoacids.

8.7 pH and pKa
- TRA-13.B: Use pH vs. pKa comparisons to predict relative proportions of acid and conjugate base; determine whether a salt solution is acidic, basic, or neutral by hydrolysis.
`,
  9: `
UNIT 9: Applications of Thermodynamics — AP Chemistry CED Learning Objectives

9.1 Introduction to Entropy
- ENE-3.A: Explain entropy as a measure of the dispersal of energy and matter; predict the sign of ΔS for a process based on changes in the number of moles of gas, mixing, or phase changes.

9.2 Absolute Entropy and Entropy Change
- ENE-3.B: Calculate ΔS°rxn = Σ S°(products) − Σ S°(reactants); explain trends in absolute molar entropy (complexity, phase, molar mass).

9.3 Gibbs Free Energy and Thermodynamic Favorability
- ENE-4.A: Calculate ΔG using ΔG = ΔH − TΔS; predict thermodynamic favorability (ΔG < 0) and how it depends on temperature.

9.4 Thermodynamic and Kinetic Control
- ENE-4.B: Distinguish between thermodynamic favorability (ΔG) and kinetic favorability (activation energy); explain that a thermodynamically favorable reaction may be kinetically slow.

9.5 Free Energy and Equilibrium
- ENE-4.C: Relate ΔG° to the equilibrium constant K using ΔG° = −RT ln K; explain the relationship between the sign of ΔG° and whether K > 1, K < 1, or K = 1.

9.6 Galvanic (Voltaic) Cells
- ENE-6.A: Describe the components and operation of a galvanic cell (anode, cathode, salt bridge, electron flow direction); calculate E°cell = E°cathode − E°anode.

9.7 Electrochemistry and the Nernst Equation
- ENE-6.B: Relate ΔG° = −nFE°cell; use the Nernst equation (E = E° − (RT/nF)ln Q) to calculate cell potential under non-standard conditions; relate cell potential to spontaneity.
`,
};

const C = {
  reset:'\x1b[0m', bold:'\x1b[1m',
  green:'\x1b[32m', yellow:'\x1b[33m', red:'\x1b[31m', cyan:'\x1b[36m', gray:'\x1b[90m',
};

// Models in priority order; pipeline falls back when TPD is exhausted on primary
// llama-3.1-8b-instant excluded from GEN_MODELS — 6k TPM limit too small for 25-question prompts
const GEN_MODELS = [
  'llama-3.3-70b-versatile',
  'meta-llama/llama-4-scout-17b-16e-instruct',
];
const VAL_MODELS = [
  'llama-3.3-70b-versatile',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'llama-3.1-8b-instant',
];

function isTPDError(err) {
  return err.message && err.message.includes('tokens per day');
}

function parseRetryAfter(err) {
  const m = err.message && err.message.match(/Please try again in ([^.]+)\./);
  return m ? m[1] : 'unknown';
}

// ─── CLI args ─────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { unit: null, target: 90, maxRounds: 10 };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--unit')       opts.unit      = parseInt(args[++i], 10);
    if (args[i] === '--target')     opts.target    = parseInt(args[++i], 10);
    if (args[i] === '--max-rounds') opts.maxRounds = parseInt(args[++i], 10);
  }
  if (!opts.unit || opts.unit < 1 || opts.unit > 9) {
    console.error('Usage: node pipeline.js --unit [1-9] [--target 90] [--max-rounds 10]');
    process.exit(1);
  }
  return opts;
}

// ─── File helpers ─────────────────────────────────────────────────────────────

const CLEAN_DIR  = path.join(__dirname, '..', 'content', 'apchem');
const RAW_DIR    = path.join(__dirname, '..', 'content', 'raw');

function cleanFilePath(unit) {
  return path.join(CLEAN_DIR, `unit${unit}_clean.json`);
}

function loadClean(unit) {
  const p = cleanFilePath(unit);
  if (!fs.existsSync(p)) return [];
  const text = fs.readFileSync(p, 'utf8');
  try { return JSON.parse(text); } catch { return []; }
}

function saveClean(unit, questions) {
  fs.mkdirSync(CLEAN_DIR, { recursive: true });
  fs.writeFileSync(cleanFilePath(unit), JSON.stringify(questions, null, 2));
}

// ─── Generation ───────────────────────────────────────────────────────────────

function buildGenerationPrompt(unit, batchSize, alreadyHave) {
  const nMcStatic  = Math.round(batchSize * 0.50);
  const nMcNumeric = Math.round(batchSize * 0.30);
  const nFrStatic  = Math.round(batchSize * 0.15);
  const nFrNumeric = batchSize - nMcStatic - nMcNumeric - nFrStatic;
  const decks = UNIT_DECKS[unit].join(', ');

  return {
    system: `You are an expert AP Chemistry exam question author. Generate questions in strict JSON format.
Rules:
- Accurate to the AP Chemistry CED for ${UNIT_NAMES[unit]}
- Varied difficulty: ~40% easy, ~40% medium, ~20% hard
- mc_numeric answer_formula and distractor formulas: valid mathjs expressions using only param names and numeric literals
- All 3 distractor formulas must produce values different from the correct answer
- fr_static accepted_answers must be lowercase
- No "all of the above", "none of the above", or "both A and B" options
- Output a raw JSON array of exactly ${batchSize} objects. No markdown fences, no commentary.`,

    user: `Generate ${batchSize} source cards for AP Chemistry — ${UNIT_NAMES[unit]} (exam weight: ${UNIT_EXAM_WEIGHT[unit]}%).

Breakdown: ${nMcStatic} mc_static, ${nMcNumeric} mc_numeric, ${nFrStatic} fr_static, ${nFrNumeric} fr_numeric.
Distribute evenly across decks: ${decks}.
Context: I already have ${alreadyHave} validated questions. Vary depth — don't repeat basic-level concepts already covered.

Schema for each card:
{
  "subject": "AP Chemistry",
  "unit": "${UNIT_NAMES[unit]}",
  "unit_exam_weight_pct": ${UNIT_EXAM_WEIGHT[unit]},
  "deck": "<deck name from list above>",
  "type": "mc_static|mc_numeric|fr_static|fr_numeric",
  "difficulty": "easy|medium|hard",
  "tags": ["snake_case_tag"],
  "source": "ced_generated",
  "reviewed": false,
  "visual": null,
  "content": { ... }
}

mc_static content:   { "stem": "...", "options": ["A","B","C","D"], "correct_index": 0 }
mc_numeric content:  { "stem": "...{{a}}...{{b}}...", "params": {"a":{"min":1,"max":10,"step":1}}, "answer_formula": "a/b", "precision": 2, "unit": "mol", "distractors": [{"formula":"a*b","error_type":"..."},{"formula":"a+b","error_type":"..."},{"formula":"b/a","error_type":"..."}] }
fr_static content:   { "stem": "...", "accepted_answers": ["lowercase answer"], "semantic_fallback": true }
fr_numeric content:  { "stem": "...{{a}}...", "params": {"a":{"min":10,"max":100,"step":5}}, "answer_formula": "a*4.18", "precision": 1, "unit": "J", "tolerance": 0.05, "semantic_fallback": false }

Output the raw JSON array only — starting with [ and ending with ].`,
  };
}

async function generateBatch(client, unit, batchSize, alreadyHave, modelIndex = 0) {
  const { system, user } = buildGenerationPrompt(unit, batchSize, alreadyHave);
  const model = GEN_MODELS[modelIndex] || GEN_MODELS[GEN_MODELS.length - 1];

  const completion = await client.chat.completions.create({
    model,
    temperature: 0.7,
    max_tokens: 8000,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });

  let text = completion.choices[0].message.content.trim();
  // Strip reasoning model <think>...</think> blocks
  text = text.replace(/^<think>[\s\S]*?<\/think>\s*/i, '').trim();
  // Strip markdown fences
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  return { questions: JSON.parse(text), modelIndex };
}

// ─── Validation ───────────────────────────────────────────────────────────────

function schemaCheck(q) {
  const issues = [];
  const c = q.content;
  if (!c) return ['missing content'];
  if (!['easy','medium','hard'].includes(q.difficulty)) issues.push(`bad difficulty: ${q.difficulty}`);

  if (q.type === 'mc_static' || q.type === 'mc_numeric') {
    if (!c.stem) issues.push('missing stem');
    if (!Array.isArray(c.options) || c.options.length !== 4)
      issues.push(`options: need 4, got ${Array.isArray(c.options) ? c.options.length : 'missing'}`);
    if (typeof c.correct_index !== 'number' || c.correct_index < 0 || c.correct_index > 3)
      issues.push(`bad correct_index: ${c.correct_index}`);
    if (Array.isArray(c.options) && new Set(c.options).size !== c.options.length)
      issues.push('duplicate options');
    if (Array.isArray(c.options)) {
      for (const o of c.options)
        if (['all of the above','none of the above','both a and b'].some(b => o.toLowerCase().includes(b)))
          issues.push(`forbidden option: "${o.slice(0,40)}"`);
    }
  }
  if (q.type === 'mc_numeric') {
    if (!c.params) issues.push('missing params');
    if (!c.answer_formula) issues.push('missing answer_formula');
    if (!Array.isArray(c.distractors) || c.distractors.length !== 3) issues.push('need 3 distractors');
    if (c.stem && c.params)
      for (const p of Object.keys(c.params))
        if (!c.stem.includes(`{{${p}}}`)) issues.push(`{{${p}}} not in stem`);
  }
  if (q.type === 'fr_static') {
    if (!c.stem) issues.push('missing stem');
    if (!Array.isArray(c.accepted_answers) || c.accepted_answers.length === 0)
      issues.push('missing accepted_answers');
  }
  return issues;
}

function buildValidationPrompt(unit) {
  return `You are a strict AP Chemistry question validator. Use only the AP Chemistry CED as your reference.

${CED_OBJECTIVES[unit]}

For each question, assess:
1. solvable (1-10): Can a student with only Unit ${unit} knowledge definitively solve it? Missing data or invalid formula = ≤4.
2. factual_accuracy (1-10): Is the marked answer provably correct? Are all distractors wrong? Error = ≤4.
3. curriculum_fit (1-10): Does this test a specific CED learning objective for Unit ${unit}? Trivial recall = ≤4.
4. distractor_quality (1-10): Are wrong answers plausible student mistakes?
5. clarity (1-10): Is the stem precise and unambiguous?

Verdict:
- PASS: solvable≥8 AND factual_accuracy≥8 AND curriculum_fit≥7 AND others≥6
- FLAG: solvable 6-7 OR factual_accuracy 6-7 OR curriculum_fit 5-6 OR any other 4-5
- FAIL: solvable≤5 OR factual_accuracy≤5 OR curriculum_fit≤4

Return JSON object: { "results": [ { "index": 0, "verdict": "PASS"|"FLAG"|"FAIL", "scores": {...}, "issues": [], "notes": "..." } ] }`;
}

async function validateBatch(client, unit, questions, offset, modelIndex = 0) {
  const systemPrompt = buildValidationPrompt(unit);
  const model = VAL_MODELS[modelIndex] || VAL_MODELS[VAL_MODELS.length - 1];
  const userContent = questions.map((q, i) => {
    const c = q.content;
    let text = `[Q${offset + i + 1}] type=${q.type} difficulty=${q.difficulty}\nStem: ${c.stem || '(none)'}\n`;
    if (q.type === 'mc_static' || q.type === 'mc_numeric') {
      (c.options || []).forEach((o, j) => { text += `  ${j === c.correct_index ? '✓' : ' '}${j}. ${o}\n`; });
    }
    if (q.type === 'mc_numeric')
      text += `Formula: ${c.answer_formula}  Params: ${JSON.stringify(c.params)}  Distractors: ${(c.distractors||[]).map(d=>d.formula).join(' | ')}\n`;
    if (q.type === 'fr_static')
      text += `Answers: ${(c.accepted_answers||[]).join(', ')}\n`;
    return text;
  }).join('\n---\n');

  const completion = await client.chat.completions.create({
    model,
    temperature: 0.1,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Evaluate these ${questions.length} questions:\n\n${userContent}` },
    ],
  });

  const parsed = JSON.parse(completion.choices[0].message.content.trim());
  return { results: Array.isArray(parsed) ? parsed : (parsed.results ?? Object.values(parsed)[0]), modelIndex };
}

// ─── Main pipeline ────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs();

  if (!process.env.GROQ_API_KEY) {
    console.error(`${C.red}Error: GROQ_API_KEY not set in scripts/.env${C.reset}`);
    process.exit(1);
  }

  const client = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const BATCH_GEN  = 25;  // questions to generate per round (lower = more reliable JSON from LLM)
  const BATCH_VAL  = 5;   // questions per validation call

  console.log(`\n${C.bold}StudyArena Content Pipeline${C.reset}`);
  console.log(`Unit: ${UNIT_NAMES[opts.unit]}`);
  console.log(`Target: ${opts.target} clean questions\n`);

  let clean = loadClean(opts.unit);
  console.log(`Starting with ${C.cyan}${clean.length}${C.reset} existing clean questions.`);

  let genModelIdx = 0;
  let valModelIdx = 0;

  for (let round = 1; round <= opts.maxRounds; round++) {
    if (clean.length >= opts.target) break;

    const needed = opts.target - clean.length;
    const batchSize = Math.min(BATCH_GEN, needed + 5);
    const genModel = GEN_MODELS[genModelIdx] || GEN_MODELS[GEN_MODELS.length - 1];

    console.log(`\n${C.bold}── Round ${round} ──${C.reset}  Have ${clean.length}/${opts.target}, generating ${batchSize} (${C.gray}${genModel}${C.reset})...`);

    // ── Generate ──────────────────────────────────────────────────────────────
    let generated = [];
    let genOk = false;
    let tpdExhausted = false;
    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        const res = await generateBatch(client, opts.unit, batchSize, clean.length, genModelIdx);
        generated = res.questions;
        console.log(`${C.gray}Generated ${generated.length} questions${C.reset}`);
        genOk = true;
        break;
      } catch (err) {
        if (isTPDError(err)) {
          if (genModelIdx < GEN_MODELS.length - 1) {
            genModelIdx++;
            console.log(`${C.yellow}Daily limit on ${GEN_MODELS[genModelIdx - 1]}, trying ${GEN_MODELS[genModelIdx]}${C.reset}`);
            attempt = 0; // reset attempts for new model
          } else {
            console.error(`${C.red}Daily limit exhausted on all models. Retry in: ${parseRetryAfter(err)}${C.reset}`);
            tpdExhausted = true;
            break;
          }
        } else if (err.message && (err.message.includes('decommissioned') || err.message.includes('413') || err.message.includes('Request too large'))) {
          if (genModelIdx < GEN_MODELS.length - 1) {
            genModelIdx++;
            console.log(`${C.yellow}Model unavailable, trying ${GEN_MODELS[genModelIdx]}${C.reset}`);
            attempt = 0;
          } else {
            console.error(`${C.red}All generation models unavailable. Daily limits likely hit. Try again tomorrow.${C.reset}`);
            tpdExhausted = true;
            break;
          }
        } else {
          console.log(`${C.yellow}Attempt ${attempt} failed (${err.message.slice(0, 60)}), retrying...${C.reset}`);
          await new Promise(r => setTimeout(r, 3000));
        }
      }
    }
    if (tpdExhausted) break;
    if (!genOk || generated.length === 0) continue;

    // ── Schema filter ─────────────────────────────────────────────────────────
    const schemaPass = [];
    let schemaFail = 0;
    for (const q of generated.filter(q => q != null)) {
      const issues = schemaCheck(q);
      if (issues.length === 0) schemaPass.push(q);
      else schemaFail++;
    }
    if (schemaFail > 0)
      console.log(`${C.yellow}Schema removed: ${schemaFail}${C.reset}`);

    // ── AI validation in batches ──────────────────────────────────────────────
    const passedQuestions = [];
    let aiFail = 0, aiFlag = 0;

    for (let i = 0; i < schemaPass.length; i += BATCH_VAL) {
      const batch = schemaPass.slice(i, i + BATCH_VAL);
      let results = [];
      let valOk = false;

      for (let attempt = 1; attempt <= 4; attempt++) {
        try {
          const res = await validateBatch(client, opts.unit, batch, i, valModelIdx);
          results = res.results;
          valOk = true;
          break;
        } catch (err) {
          if (isTPDError(err)) {
            if (valModelIdx < VAL_MODELS.length - 1) {
              valModelIdx++;
              console.log(`${C.yellow}Validation: daily limit, switching to ${VAL_MODELS[valModelIdx]}${C.reset}`);
              attempt = 0;
            } else {
              console.error(`${C.red}Validation daily limit exhausted. Retry in: ${parseRetryAfter(err)}${C.reset}`);
              break;
            }
          } else if (err.message && (err.message.includes('decommissioned') || err.message.includes('413') || err.message.includes('Request too large'))) {
            if (valModelIdx < VAL_MODELS.length - 1) { valModelIdx++; attempt = 0; }
            else break;
          } else {
            if (attempt < 3) await new Promise(r => setTimeout(r, 2000 * attempt));
          }
        }
      }

      if (!valOk) {
        results = batch.map((_, j) => ({ index: j, verdict: 'FLAG' }));
      }

      const icons = { PASS: `${C.green}✓${C.reset}`, FLAG: `${C.yellow}⚑${C.reset}`, FAIL: `${C.red}✗${C.reset}` };
      process.stdout.write(`  Batch ${Math.floor(i/BATCH_VAL)+1}: ${results.map(r => icons[r.verdict] ?? '?').join(' ')}\n`);

      for (let j = 0; j < results.length; j++) {
        const verdict = results[j]?.verdict;
        if (verdict === 'PASS') passedQuestions.push(batch[j]);
        else if (verdict === 'FAIL') aiFail++;
        else aiFlag++;
      }

      await new Promise(r => setTimeout(r, 400));
    }

    // ── Merge into clean file ─────────────────────────────────────────────────
    clean = [...clean, ...passedQuestions];
    saveClean(opts.unit, clean);

    console.log(`  +${passedQuestions.length} added  |  flagged: ${aiFlag}  failed: ${aiFail}`);
    console.log(`  ${C.bold}Total clean: ${clean.length}/${opts.target}${C.reset}`);
  }

  // ── Final summary ─────────────────────────────────────────────────────────
  console.log(`\n${C.bold}════════════════════════════════${C.reset}`);
  if (clean.length >= opts.target) {
    console.log(`${C.green}${C.bold}✓ Target reached: ${clean.length} clean questions for Unit ${opts.unit}${C.reset}`);
  } else {
    console.log(`${C.yellow}Stopped at ${clean.length}/${opts.target} after ${opts.maxRounds} rounds.${C.reset}`);
    console.log(`${C.yellow}Run again to continue, or increase --max-rounds.${C.reset}`);
  }
  console.log(`Clean file: ${C.cyan}${cleanFilePath(opts.unit)}${C.reset}`);
  console.log(`${C.bold}════════════════════════════════${C.reset}\n`);
}

main().catch(err => {
  console.error(`${C.red}Fatal:${C.reset}`, err);
  process.exit(1);
});
