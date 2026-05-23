# StudyArena — Question Generation Pipeline

**Version:** 1.0  
**Date:** 2026-05-22

This document covers the end-to-end process of turning an AP Course and Exam Description (CED) PDF into validated source cards in the database.

---

## 0. Launch Subject

**First subject: AP Chemistry only.**  
All other subjects follow the same pipeline once AP Chemistry is live and reviewed. Expand to AP Biology, AP US History, AP Psychology, and AP Calculus AB in Phase 2.

---

## 1. Overview

```
CED PDF
  └─► Extract unit structure + exam weights
        └─► Compute question distribution per unit
              └─► Generate cards in batches (Claude Sonnet)
                    └─► Validate output (schema + formula check)
                          └─► Insert into source_cards (reviewed: false)
                                └─► Spot-check review → set reviewed: true
                                      └─► Trigger variant pre-generation (Claude Haiku ×20)
```

---

## 2. Models

| Task | Model | How | Cost |
|---|---|---|---|
| Card generation from CED | **Claude Sonnet** (via claude.ai) | Manual — upload CED PDF, paste prompt, copy JSON output to file | $0 (existing subscription) |
| Variant rendering (one-time pre-gen) | **Claude Haiku** (API) | Script — runs after cards are reviewed and imported | ~$10 total for all MVP variants |
| Variant rephrasing (runtime) | **Claude Haiku** (API) | Called at battle load for `mc_static` / `fr_static` stem variation | Pay-as-you-go, <$10/mo at launch scale |

**Generation uses claude.ai directly, not the API.** Upload the CED PDF as an attachment, paste the prompt, copy the JSON array response into a file. No API key, no code, no cost. The API is only needed for the Haiku variant pipeline after cards are reviewed.

---

## 3. Input: CED Structure

Before generating, extract the following from each CED PDF:

| Unit | Name | Weight | `unit_exam_weight_pct` |
|---|---|---|---|
| 1 | Atomic Structure and Properties | 9% | 9 |
| 2 | Molecular and Ionic Compound Structure and Properties | 9% | 9 |
| 3 | Intermolecular Forces and Properties | 22% | 22 |
| 4 | Chemical Reactions | 9% | 9 |
| 5 | Kinetics | 9% | 9 |
| 6 | Thermodynamics | 9% | 9 |
| 7 | Equilibrium | 9% | 9 |
| 8 | Acids and Bases | 15% | 15 |
| 9 | Applications of Thermodynamics | 9% | 9 |
| **Total** | | **100%** | |

---

## 4. Question Distribution

Distribute the 1,000-question target proportionally to unit exam weights.

**Formula:** `questions_for_unit = round(1000 × unit_weight / total_weight)`

**AP Chemistry distribution:**

| Unit | Weight | Questions | Batches |
|---|---|---|---|
| Unit 1 | 9% | 90 | 2 |
| Unit 2 | 9% | 90 | 2 |
| Unit 3 | 22% | 220 | 5 |
| Unit 4 | 9% | 90 | 2 |
| Unit 5 | 9% | 90 | 2 |
| Unit 6 | 9% | 90 | 2 |
| Unit 7 | 9% | 90 | 2 |
| Unit 8 | 15% | 150 | 3 |
| Unit 9 | 9% | 90 | 2 |
| **Total** | **100%** | **1,000** | **22** |

Within each unit, target roughly:
- **50% `mc_static`** — conceptual, definition, identification
- **30% `mc_numeric`** — calculation-based (where the subject has numeric content)
- **15% `fr_static`** — short text answer
- **5% `fr_numeric`** — computed short answer

For non-quantitative subjects (AP US History, AP Psychology), use:
- **60% `mc_static`**, **0% `mc_numeric`**, **30% `fr_static`**, **10% `fr_numeric`**

---

## 5. Generation Prompt Structure

Generate in batches of **50 cards per prompt** to stay within context limits and keep output quality high. For a 1,000-question subject: 20 batches.

### System prompt

```
You are an expert AP exam question author. You write questions in strict JSON format 
matching the StudyArena source card schema. Every card you produce must be:
- Accurate to the AP curriculum as described in the provided CED content
- Varied in difficulty (roughly 40% easy, 40% medium, 20% hard per batch)
- For mc_numeric and fr_numeric types: the answer_formula and distractor formulas must 
  be valid mathjs expressions using only the param variable names and numeric literals
- For mc_numeric: all 3 distractor formulas must produce values different from the 
  correct answer for all param combinations in the defined ranges
- For fr_static: accepted_answers must be lowercase

Output a JSON array of exactly {batch_size} source card objects. No commentary, no 
markdown fences — raw JSON array only.
```

### How to run a batch in claude.ai

1. Open a new conversation in claude.ai
2. Attach the CED PDF for the subject
3. Paste the system prompt, then the user prompt below
4. Copy the entire JSON array response
5. Save it to `raw/ap_chemistry_unit4_batch1.json` (see §7)
6. Start a new conversation for the next batch (don't continue — long context degrades output quality)

### User prompt (per batch)

```
I have attached the AP Chemistry CED PDF.

Generate {n} source cards for Unit 4: Chemical Reactions (exam weight: 8%).
- {n_mc_static} mc_static cards
- {n_mc_numeric} mc_numeric cards  
- {n_fr_static} fr_static cards
- {n_fr_numeric} fr_numeric cards

Use only content from Unit 4 of the attached CED. Each card must follow this exact schema:

{paste the full source card JSON schema from CARD_SCHEMA.md §2–§3}

Example of a correct mc_numeric card with valid formula structure:
{paste the AP Calculus power rule example from CARD_SCHEMA.md §8}

Output a raw JSON array of exactly {n} cards. No markdown fences, no commentary.
```

**Important:** Always include at least one concrete `mc_numeric` example in the prompt. Sonnet reliably produces valid `answer_formula` and `distractor.formula` fields when it has a working example to follow; without it, formula quality degrades on bulk runs.

**Do not continue the same conversation across batches.** Start a fresh conversation each time — long context causes Claude to drift from the schema and repeat questions from earlier batches.

### AP Chemistry: SMILES images

For AP Chemistry, instruct Claude to add a `visual` field with `type: "smiles"` whenever the question involves identifying, drawing, or analyzing a molecular structure. Claude knows SMILES notation accurately for all common AP Chemistry molecules.

Add this line to the user prompt for AP Chemistry batches:

```
For any question involving a molecular structure, functional group, isomer, or Lewis
structure, include a "visual" field with type "smiles" and the correct SMILES string
for the relevant molecule. Example:
  "visual": { "type": "smiles", "value": "CC(=O)O", "caption": "Acetic acid" }
Do NOT include a visual field for questions that don't involve a specific structure.
```

This covers: identifying molecules, naming functional groups, isomer recognition, VSEPR geometry questions, Lewis structure identification, and acid/base conjugate pair questions.

For questions involving graphs (titration curves, kinetics, phase diagrams), set `visual` to `null` for now — static image files for these will be added in a later pass.

---

## 6. Validation Steps

Run these checks on every batch before inserting into the database. Reject and regenerate any card that fails.

### 6.1 Schema validation
- JSON parses without error
- All required fields present (`subject`, `unit`, `type`, `difficulty`, `content`, etc.)
- `type` is one of the four valid values
- `content` structure matches the declared type (e.g. `mc_static` has `options` array of length 4)

### 6.2 Formula validation (mc_numeric, fr_numeric only)
For every `mc_numeric` and `fr_numeric` card:
1. Sample 10 random param combinations within the defined ranges
2. Evaluate `answer_formula` using mathjs for each combination
3. Verify result is finite, non-NaN, and passes `allow_negative` constraint
4. For `mc_numeric`: evaluate all 3 distractor formulas for each combination
5. Verify no distractor result equals the correct answer after rounding to `precision`
6. Verify no two distractors are equal after rounding

**Reject the card if any combination fails.** Do not attempt to fix formulas automatically — regenerate the card.

### 6.3 Content sanity checks
- `fr_static` accepted_answers are all lowercase
- `mc_static` options array has no duplicates
- `stem` contains `{{var}}` placeholders for every key in `params` (numeric types only)
- No `{{var}}` in `stem` that isn't defined in `params`

### 6.4 Duplicate detection
- Hash `(subject + unit + stem_template)` before insertion
- Reject if hash already exists in `source_cards`

---

## 7. File Structure for Raw Output

Save each batch as a JSON file immediately after copying from claude.ai. Don't accumulate them in one file — smaller files are easier to re-run if a batch fails validation.

```
content/
  raw/
    ap_biology_unit1_batch1.json
    ap_biology_unit1_batch2.json
    ap_biology_unit2_batch1.json
    ...
  validated/
    ap_biology_unit1_batch1.json   ← copied here after passing validation
    ...
  rejected/
    ap_biology_unit2_batch3.json   ← moved here if validation fails; regenerate
```

Each file is a raw JSON array of source card objects (no wrapping object, no metadata — just the array).

---

## 8. Review Workflow

All generated cards are inserted with `reviewed: false` and are **not served in battles** until reviewed.

### Spot-check process
- Review a random 10% sample per batch (5 cards per 50-card batch)
- If >1 card in the sample has a factual error → reject the entire batch and regenerate
- If the sample passes → set `reviewed = true` for the entire batch via:

```sql
UPDATE source_cards
SET reviewed = true
WHERE subject = 'AP Chemistry'
  AND unit = 'Unit 4: Chemical Reactions'
  AND source = 'ced_generated'
  AND reviewed = false;
```

### What to check during spot-review
- Is the question factually correct per the CED?
- Is the correct answer actually correct?
- For numeric questions: do the param ranges produce realistic AP-exam-level values?
- Are the distractors plausible wrong answers (not random nonsense)?

---

## 9. Variant Pre-Generation

After a batch is marked `reviewed: true`, trigger variant generation for each new card:

```
For each new source card:
  Generate 20 question_variant records using Claude Haiku
  → For mc_numeric / fr_numeric: sample 20 distinct param combinations, render stem, compute answer
  → For mc_static / fr_static: ask Haiku to rephrase the stem 20 ways (same answer, different wording)
  Insert all 20 variants into question_variants
```

This step is the only place Haiku is used in the content pipeline. Cost: ~$0.002 per card × 1,000 cards × 5 subjects = ~$10 total for all MVP variants.

---

## 10. Estimated Timeline

| Step | Time | API cost |
|---|---|---|
| Extract CED unit structure (5 subjects) | 1–2 hrs | $0 |
| Run generation batches in claude.ai (100 batches total) | 3–5 hrs | $0 |
| Automated validation script | 30 min | $0 |
| Spot-check review (10% sample, 5 subjects) | 3–5 hrs | $0 |
| DB import | 30 min | $0 |
| Variant pre-generation via Haiku API | 1–2 hrs | ~$10 |
| **Total** | **~2 days** | **~$10** |

The 3–5 hours of spot-check review is the real bottleneck, not generation. Budget a full day for it.

---

## 11. Future: Expanding Beyond 1,000

When adding a new subject or expanding to SAT/IB:
1. Obtain the relevant exam description document
2. Extract unit structure and weights
3. Compute question distribution
4. Run the same generation + validation + review pipeline
5. Add the new subject to the canonical subject list in `CARD_SCHEMA.md §6`

When expanding to user-created decks (post-MVP), the same schema applies — `source` will be `"user_created"` and `reviewed` will follow a different moderation workflow.
