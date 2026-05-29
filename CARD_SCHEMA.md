# StudyArena — Source Card Schema

**Version:** 1.0  
**Date:** 2026-05-22

This document defines the format for source cards authored into the deck library, the pre-generated variant records stored per card, and the database tables that back both.

---

## 1. Card Types

| Type | Description |
|---|---|
| `mc_static` | Multiple choice, no numbers — options are fixed strings |
| `mc_numeric` | Multiple choice, numeric answer — stem and options use formula placeholders |
| `fr_static` | Free response, text answer — exact match + semantic fallback |
| `fr_numeric` | Free response, numeric answer — stem uses placeholders, answer computed from formula |

---

## 2. Source Card Format

Every card shares a common envelope. Type-specific fields are nested under `content`.

```json
{
  "id": "uuid",
  "subject": "AP Chemistry",
  "unit": "Unit 4: Chemical Reactions",
  "unit_exam_weight_pct": 7,
  "deck": "Stoichiometry",
  "type": "mc_static | mc_numeric | fr_static | fr_numeric",
  "difficulty": "easy | medium | hard",
  "tags": ["stoichiometry", "molar_mass"],
  "source": "ced_generated",
  "reviewed": false,
  "visual": null,
  "content": { ... }
}
```

### Field rules
- `subject` — must match the canonical subject list (see §6)
- `unit` — free string matching the CED unit name exactly (e.g. "Unit 4: Chemical Reactions")
- `unit_exam_weight_pct` — integer; the CED exam weighting for this unit (used to distribute question count proportionally)
- `deck` — the named deck this card belongs to within a unit
- `difficulty` — used for question ordering within a battle (easy → hard)
- `tags` — concept tags derived from the CED essential knowledge statements
- `source` — `"ced_generated"` for all AI-authored cards; reserved for `"user_created"` in a future version
- `reviewed` — `false` on generation; set to `true` after a human spot-check pass; only `reviewed: true` cards are served in battles
- `visual` — optional; see §3.5

---

## 3. Type-Specific Content Fields

### 3.1 `mc_static` — Multiple choice, no numbers

```json
{
  "type": "mc_static",
  "content": {
    "stem": "Which organelle is primarily responsible for ATP synthesis via cellular respiration?",
    "options": [
      "Mitochondria",
      "Nucleus",
      "Ribosome",
      "Golgi apparatus"
    ],
    "correct_index": 0
  }
}
```

- `options` — array of exactly 4 strings
- `correct_index` — 0-based index of the correct option
- Haiku generates variants by rephrasing the stem and shuffling distractor order; the correct answer label never changes

---

### 3.2 `mc_numeric` — Multiple choice, numeric answer

```json
{
  "type": "mc_numeric",
  "content": {
    "stem": "A solution has a molarity of {{a}} M and is diluted by a factor of {{b}}. What is the final molarity (in M)?",
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
}
```

- `params` — defines each `{{variable}}` used in the stem; `step` controls granularity
- `answer_formula` — safe math expression evaluated server-side (using mathjs); references param names only
- `precision` — decimal places to round the computed answer to before display
- `unit` — appended to the answer label in the UI (e.g. "0.75 M"); optional
- `distractors` — exactly 3 entries; each has a `formula` (same safe eval rules as `answer_formula`) and an `error_type` label for internal analytics
- At generation time: params are sampled, all four values (answer + 3 distractors) are computed, then shuffled — `correct_index` is determined after shuffle and stored in the variant record

#### Param sampling constraints
- Values are drawn uniformly from `{min, min+step, min+2*step, …, max}`
- The generator must verify the computed answer and all distractors are finite, non-NaN, and non-negative (unless the concept requires negative values — flag with `"allow_negative": true`)
- If any distractor collides with the correct answer after rounding, resample up to 5 times, then fall back to a default distractor set defined per card

---

### 3.3 `fr_static` — Free response, text answer

```json
{
  "type": "fr_static",
  "content": {
    "stem": "Name the process by which plants convert sunlight into chemical energy.",
    "accepted_answers": ["photosynthesis"],
    "semantic_fallback": true
  }
}
```

- `accepted_answers` — array of exact-match strings (lowercased, trimmed before comparison)
- `semantic_fallback` — if `true`, answers that don't exact-match are sent to Claude Haiku for semantic grading (1–2s "checking…" state); if `false`, only exact match is accepted
- Set `semantic_fallback: false` for answers where paraphrases are wrong (e.g. specific names, dates, formulas)

---

### 3.4 `fr_numeric` — Free response, numeric answer

```json
{
  "type": "fr_numeric",
  "content": {
    "stem": "A {{a}} g sample of water is heated by {{b}} °C. How many joules of energy were absorbed? (c = 4.18 J/g°C)",
    "params": {
      "a": { "min": 10, "max": 100, "step": 5 },
      "b": { "min": 5,  "max": 50,  "step": 5 }
    },
    "answer_formula": "a * b * 4.18",
    "precision": 1,
    "unit": "J",
    "tolerance": 0.05,
    "semantic_fallback": false
  }
}
```

- `tolerance` — fractional tolerance for accepted answers (0.05 = ±5%); handles rounding differences
- `semantic_fallback` — always `false` for numeric free response; graded by value comparison only

---

### 3.5 `visual` — Optional image attachment

Any card type can include a `visual` field. It is displayed above the question stem in the battle UI. Three visual types are supported:

#### `smiles` — Molecular structure (AP Chemistry primary image type)

```json
"visual": {
  "type": "smiles",
  "value": "CC(=O)O",
  "caption": "Acetic acid"
}
```

- `value` — a valid SMILES string; rendered client-side by [SmilesDrawer](https://github.com/reymond-group/smilesDrawer) (MIT, no backend needed)
- Claude can generate accurate SMILES strings for all common AP Chemistry molecules
- This covers: molecular structure questions, Lewis structure identification, isomer recognition, functional group questions
- No image files needed — SMILES renders to SVG in the browser

#### `image` — Static image file

```json
"visual": {
  "type": "image",
  "path": "ap_chemistry/titration_curve_01.png",
  "caption": "Titration curve for a weak acid with strong base",
  "alt": "Graph showing pH vs volume of NaOH added, with equivalence point at pH 8.7"
}
```

- `path` — relative path within Supabase Storage bucket `card-visuals`
- `alt` — required for accessibility; also used as fallback text if image fails to load
- Static images must be uploaded to Supabase Storage separately before the card can go live
- Use for: graphs, lab apparatus diagrams, spectroscopy charts, energy diagrams that can't be represented as SMILES

#### `data_chart` — Programmatic chart (future, not MVP)

Reserved for charts generated from structured data (titration curves, kinetics graphs). Not implemented in MVP — use `image` type for charts at launch.

#### Visual field in the DB

```sql
-- visual is stored as a JSONB column on source_cards
-- NULL means no visual; validated at insert time
visual  JSONB
```

The validation script checks that:
- `type` is one of `smiles`, `image`, `data_chart`
- `smiles` cards have a non-empty `value` string
- `image` cards have a non-empty `path` and `alt` string

---

## 4. Pre-Generated Variant Record

When a new source card is added, the generation pipeline creates **20 variants** and stores them in the `question_variants` table. Variants are drawn from at battle load time — the LLM is never called during a live battle.

```json
{
  "id": "uuid",
  "source_card_id": "uuid",
  "rendered_stem": "A solution has a molarity of 2.5 M and is diluted by a factor of 4. What is the final molarity (in M)?",
  "rendered_options": ["0.63 M", "10.00 M", "6.50 M", "1.60 M"],
  "correct_index": 0,
  "correct_value": 0.625,
  "param_values": { "a": 2.5, "b": 4 },
  "used_in_battle_count": 0,
  "created_at": "2026-05-22T00:00:00Z"
}
```

- `rendered_stem` — final question text with all `{{vars}}` substituted
- `rendered_options` — for MC: 4 strings with unit appended; for FR: null
- `correct_index` — for MC: index in `rendered_options`; for FR: null
- `correct_value` — for numeric types: the computed float (used for tolerance grading); for static types: null
- `used_in_battle_count` — incremented each time this variant is drawn; used to deprioritize overused variants

---

## 5. Database Tables

```sql
source_cards (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject               TEXT NOT NULL,
  unit                  TEXT NOT NULL,
  unit_exam_weight_pct  INTEGER NOT NULL,
  deck                  TEXT NOT NULL,
  type                  TEXT NOT NULL CHECK (type IN ('mc_static','mc_numeric','fr_static','fr_numeric')),
  difficulty            TEXT NOT NULL CHECK (difficulty IN ('easy','medium','hard')),
  tags                  TEXT[],
  source                TEXT NOT NULL DEFAULT 'ced_generated',
  reviewed              BOOLEAN NOT NULL DEFAULT false,
  visual                JSONB,
  content               JSONB NOT NULL,
  content_hash          TEXT UNIQUE NOT NULL,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
)

question_variants (
  id                    UUID PRIMARY KEY,
  source_card_id        UUID REFERENCES source_cards(id) ON DELETE CASCADE,
  rendered_stem         TEXT NOT NULL,
  rendered_options      TEXT[],
  correct_index         INTEGER,
  correct_value         NUMERIC,
  param_values          JSONB,
  used_in_battle_count  INTEGER DEFAULT 0,
  created_at            TIMESTAMPTZ DEFAULT now()
)
```

Index `question_variants(source_card_id)` — the battle loader queries by card ID to draw variants.

---

## 6. Canonical Subject List (MVP)

```
AP Biology
AP Chemistry
AP US History
AP Psychology
AP Calculus AB
```

`subject` on a source card must exactly match one of these strings for MVP. New subjects are added to this list when Phase 2 decks are authored.

---

## 7. Authoring Constraints Summary

| Rule | Applies to |
|---|---|
| Exactly 4 options | `mc_static`, `mc_numeric` |
| Exactly 3 distractors | `mc_numeric` |
| `{{var}}` names in stem must match keys in `params` | `mc_numeric`, `fr_numeric` |
| `answer_formula` and distractor `formula` fields reference only param names and numeric literals | `mc_numeric`, `fr_numeric` |
| `precision` must be defined when `unit` is defined | `mc_numeric`, `fr_numeric` |
| `semantic_fallback` must be `false` for all numeric types | `fr_numeric` |
| At least 1 accepted answer string | `fr_static` |
| All accepted answer strings must be lowercase | `fr_static` |

---

## 8. Example: Full Card (AP Calculus AB, Numeric MC)

```json
{
  "id": "c3f8a1b2-...",
  "subject": "AP Calculus AB",
  "unit": "Unit 2: Differentiation",
  "deck": "Power Rule",
  "type": "mc_numeric",
  "difficulty": "easy",
  "tags": ["differentiation", "power_rule"],
  "content": {
    "stem": "Find the derivative of f(x) = {{a}}x^{{n}}.",
    "params": {
      "a": { "min": 2, "max": 9, "step": 1 },
      "n": { "min": 2, "max": 6, "step": 1 }
    },
    "answer_formula": "a * n",
    "precision": 0,
    "unit": "x^(n-1) coefficient",
    "distractors": [
      { "formula": "a + n",  "error_type": "added_instead_of_multiplied" },
      { "formula": "a",      "error_type": "dropped_exponent" },
      { "formula": "n",      "error_type": "dropped_coefficient" }
    ]
  }
}
```

---

## 9. Open Questions

- [ ] Should `used_in_battle_count` trigger automatic re-generation when a variant is overused, or just deprioritize it in draws?
- [ ] What's the re-generation policy when a source card is edited — invalidate all variants, or only regenerate if the stem/params changed?

### Resolved
- **Who authors cards?** Claude Sonnet / LLaMA via Groq, given the AP CED objectives per unit. See `scripts/pipeline.js` for the end-to-end generation pipeline.
- **Numeric randomization approach:** AI generates `{{var}}` placeholders, `params` ranges, and `answer_formula` at generation time. Numbers are substituted at variant-generation time, not battle time.
- **Reviewed gate:** Only `reviewed: true` cards are served in battles. AI-generated cards default to `false`.
