# StudyArena Generation Prompt

Copy the **System Prompt** first (paste into the system prompt field if claude.ai shows one,
otherwise paste it at the top of the conversation before the user prompt).
Then copy the **User Prompt**, filling in the three values marked with ← before pasting.

Start a **fresh conversation** for every batch. Never continue across batches.

---

## SYSTEM PROMPT

```
You are an expert AP exam question author. You write questions in strict JSON format.

Rules:
- Every card must be accurate to the AP curriculum in the attached CED PDF
- Vary difficulty: roughly 40% easy, 40% medium, 20% hard across the batch
- For mc_numeric and fr_numeric: answer_formula and all distractor formulas must be
  valid mathjs expressions using only the param variable names and numeric literals
  (e.g. "a * b", "a / b + c", "2 * a"). No function calls, no external references.
- For mc_numeric: all 3 distractor formulas must produce a value different from the
  correct answer for every combination of param values within the defined ranges
- For fr_static: all accepted_answers strings must be lowercase
- For any question involving a molecular structure, functional group, isomer, Lewis
  structure, or specific molecule: include a "visual" field with type "smiles" and
  the correct SMILES string. For all other questions set "visual" to null.
- Output a raw JSON array of exactly the requested number of cards.
  No markdown fences, no commentary, no explanation — just the array.
```

---

## USER PROMPT

Fill in before pasting:
- `UNIT_NAME` ← e.g. `Unit 1: Atomic Structure and Properties`
- `UNIT_WEIGHT` ← e.g. `9`
- `BATCH_NUMBER` ← e.g. `1`

```
I have attached the AP Chemistry CED PDF.

Generate 50 source cards for UNIT_NAME (exam weight: UNIT_WEIGHT%).
This is batch BATCH_NUMBER for this unit.

Card type breakdown:
- 25 mc_static
- 15 mc_numeric
- 8  fr_static
- 2  fr_numeric

Each card must follow this exact JSON structure:

{
  "subject": "AP Chemistry",
  "unit": "UNIT_NAME",
  "unit_exam_weight_pct": UNIT_WEIGHT,
  "deck": "<short topic name within this unit, e.g. 'Electron Configuration'>",
  "type": "mc_static | mc_numeric | fr_static | fr_numeric",
  "difficulty": "easy | medium | hard",
  "tags": ["<concept tag>", "..."],
  "source": "ced_generated",
  "reviewed": false,
  "visual": null,
  "content": { ... }
}

Content structure per type:

mc_static:
  "content": {
    "stem": "<question text>",
    "options": ["<A>", "<B>", "<C>", "<D>"],
    "correct_index": 0
  }

mc_numeric:
  "content": {
    "stem": "<question text with {{a}}, {{b}} placeholders>",
    "params": {
      "a": { "min": 1, "max": 5, "step": 0.5 },
      "b": { "min": 2, "max": 8, "step": 1 }
    },
    "answer_formula": "a / b",
    "precision": 2,
    "unit": "<unit string or omit if none>",
    "distractors": [
      { "formula": "a * b", "error_type": "<description of student mistake>" },
      { "formula": "a + b", "error_type": "<description of student mistake>" },
      { "formula": "b / a", "error_type": "<description of student mistake>" }
    ]
  }

fr_static:
  "content": {
    "stem": "<question text>",
    "accepted_answers": ["<lowercase answer>", "<alternate spelling if any>"],
    "semantic_fallback": true
  }

fr_numeric:
  "content": {
    "stem": "<question text with {{a}}, {{b}} placeholders>",
    "params": {
      "a": { "min": 10, "max": 100, "step": 5 },
      "b": { "min": 5,  "max": 50,  "step": 5 }
    },
    "answer_formula": "a * b * 4.18",
    "precision": 1,
    "unit": "<unit string>",
    "tolerance": 0.05,
    "semantic_fallback": false
  }

Visual field (AP Chemistry only):
- Molecular structure questions: "visual": { "type": "smiles", "value": "<SMILES>", "caption": "<molecule name>" }
- All other questions: "visual": null

---

WORKED EXAMPLES (match this format exactly):

Example 1 — mc_static with visual (molecular structure):
{
  "subject": "AP Chemistry",
  "unit": "Unit 1: Atomic Structure and Properties",
  "unit_exam_weight_pct": 8,
  "deck": "Periodic Trends",
  "type": "mc_static",
  "difficulty": "easy",
  "tags": ["electronegativity", "periodic_trends"],
  "source": "ced_generated",
  "reviewed": false,
  "visual": null,
  "content": {
    "stem": "Which of the following elements has the highest electronegativity?",
    "options": ["Fluorine", "Oxygen", "Chlorine", "Nitrogen"],
    "correct_index": 0
  }
}

Example 2 — mc_numeric:
{
  "subject": "AP Chemistry",
  "unit": "Unit 4: Chemical Reactions",
  "unit_exam_weight_pct": 8,
  "deck": "Stoichiometry",
  "type": "mc_numeric",
  "difficulty": "medium",
  "tags": ["stoichiometry", "molar_mass"],
  "source": "ced_generated",
  "reviewed": false,
  "visual": null,
  "content": {
    "stem": "How many moles are in {{a}} grams of water (molar mass = 18.02 g/mol)?",
    "params": {
      "a": { "min": 9, "max": 90, "step": 9 }
    },
    "answer_formula": "a / 18.02",
    "precision": 2,
    "unit": "mol",
    "distractors": [
      { "formula": "a * 18.02",    "error_type": "multiplied_instead_of_divided" },
      { "formula": "a / 2",        "error_type": "divided_by_number_of_atoms_instead_of_molar_mass" },
      { "formula": "18.02 / a",    "error_type": "inverted_ratio" }
    ]
  }
}

Example 3 — mc_static with SMILES visual:
{
  "subject": "AP Chemistry",
  "unit": "Unit 2: Molecular and Ionic Compound Structure and Properties",
  "unit_exam_weight_pct": 8,
  "deck": "Lewis Structures",
  "type": "mc_static",
  "difficulty": "medium",
  "tags": ["lewis_structure", "molecular_geometry"],
  "source": "ced_generated",
  "reviewed": false,
  "visual": { "type": "smiles", "value": "O=C=O", "caption": "Carbon dioxide" },
  "content": {
    "stem": "What is the molecular geometry of the molecule shown above?",
    "options": ["Linear", "Bent", "Trigonal planar", "Tetrahedral"],
    "correct_index": 0
  }
}

Example 4 — fr_static:
{
  "subject": "AP Chemistry",
  "unit": "Unit 8: Acids and Bases",
  "unit_exam_weight_pct": 13,
  "deck": "Bronsted-Lowry Theory",
  "type": "fr_static",
  "difficulty": "easy",
  "tags": ["acids_and_bases", "bronsted_lowry"],
  "source": "ced_generated",
  "reviewed": false,
  "visual": null,
  "content": {
    "stem": "In the Brønsted-Lowry model, what is the term for a species that can act as both an acid and a base?",
    "accepted_answers": ["amphoteric", "amphiprotic"],
    "semantic_fallback": true
  }
}

---

Now generate 50 cards for UNIT_NAME following the above format exactly.
Cover a range of topics across the unit — do not concentrate on a single concept.
Output the raw JSON array only.
```

---

## AP Chemistry Unit Reference

Use these for UNIT_NAME and UNIT_WEIGHT when prompting:

| Unit | Name | Weight | Target | Batch 1 | Batch 2 | Batch 3+ |
|------|------|--------|--------|---------|---------|---------|
| 1 | Atomic Structure and Properties | 9% | 90 | 50 | 40 | — |
| 2 | Molecular and Ionic Compound Structure and Properties | 9% | 90 | 50 | 40 | — |
| 3 | Intermolecular Forces and Properties | 22% | 220 | 50 | 50 | 50×3+20 |
| 4 | Chemical Reactions | 9% | 90 | 50 | 40 | — |
| 5 | Kinetics | 9% | 90 | 50 | 40 | — |
| 6 | Thermodynamics | 9% | 90 | 50 | 40 | — |
| 7 | Equilibrium | 9% | 90 | 50 | 40 | — |
| 8 | Acids and Bases | 15% | 150 | 50 | 50 | 50 |
| 9 | Applications of Thermodynamics | 9% | 90 | 50 | 40 | — |
| **Total** | | **100%** | **1000** | | | |

For Unit 3 (22% weight, 5 batches), split by sub-topic across batches:
- Batch 1: intermolecular forces (London dispersion, dipole-dipole, hydrogen bonding)
- Batch 2: properties of solids and liquids
- Batch 3: solutions and mixtures
- Batch 4: colligative properties and separation techniques
- Batch 5: spectroscopy and photoelectron spectroscopy (20 cards)

---

## Workflow Reminder

```
1. New claude.ai conversation
2. Attach AP Chemistry CED PDF
3. Paste system prompt
4. Paste user prompt (with unit name + weight filled in)
5. Copy JSON output → save to content/raw/ap_chemistry_unit1_batch1.json
6. node validate.js ../content/raw/ap_chemistry_unit1_batch1.json
7. Spot-check 5 cards manually
8. If good → node import.js ../content/validated/ap_chemistry_unit1_batch1.json
```
