/**
 * import.js — imports validated card batches into the source_cards table
 *
 * Usage:
 *   node import.js ../content/validated/ap_chemistry_unit4_batch1.json
 *   node import.js ../content/validated/   (imports all unimported files)
 *
 * Requires:
 *   DATABASE_URL environment variable (or .env file in scripts/)
 *
 * Idempotent: duplicate content_hash rows are skipped silently via ON CONFLICT DO NOTHING.
 * A .imported log file tracks which files have already been fully imported.
 */

require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const IMPORTED_LOG = path.resolve(__dirname, '../content/.imported');

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

function loadImportedLog() {
  if (!fs.existsSync(IMPORTED_LOG)) return new Set();
  return new Set(fs.readFileSync(IMPORTED_LOG, 'utf8').split('\n').filter(Boolean));
}

function markImported(filePath) {
  fs.appendFileSync(IMPORTED_LOG, path.resolve(filePath) + '\n');
}

// ─── Import ───────────────────────────────────────────────────────────────────

async function importFile(filePath) {
  const cards = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  let inserted = 0;
  let skipped  = 0;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const card of cards) {
      const hash = contentHash(card);

      const result = await client.query(
        `INSERT INTO source_cards
           (subject, unit, unit_exam_weight_pct, deck, type, difficulty,
            tags, source, reviewed, visual, content, content_hash)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,false,$9,$10,$11)
         ON CONFLICT (content_hash) DO NOTHING
         RETURNING id`,
        [
          card.subject,
          card.unit,
          card.unit_exam_weight_pct ?? null,
          card.deck,
          card.type,
          card.difficulty,
          card.tags ?? [],
          card.source ?? 'ced_generated',
          card.visual ? JSON.stringify(card.visual) : null,
          JSON.stringify(card.content),
          hash,
        ],
      );

      if (result.rows.length > 0) inserted++;
      else skipped++;
    }

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  return { inserted, skipped, total: cards.length };
}

// ─── Entry point ─────────────────────────────────────────────────────────────

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Add it to scripts/.env or your environment.');
    process.exit(1);
  }

  const target = process.argv[2];
  if (!target) {
    console.error('Usage: node import.js <file.json|directory>');
    process.exit(1);
  }

  const abs  = path.resolve(target);
  const stat = fs.statSync(abs);
  const importedLog = loadImportedLog();

  let files;
  if (stat.isDirectory()) {
    files = fs.readdirSync(abs)
      .filter(f => f.endsWith('.json') && !f.endsWith('_errors.json'))
      .map(f => path.join(abs, f))
      .filter(f => !importedLog.has(path.resolve(f)));

    if (files.length === 0) {
      console.log('No new files to import (all already logged as imported).');
      await pool.end();
      return;
    }
  } else {
    if (importedLog.has(abs)) {
      console.log(`Already imported: ${abs}`);
      await pool.end();
      return;
    }
    files = [abs];
  }

  let totalInserted = 0;
  let totalSkipped  = 0;

  for (const filePath of files) {
    process.stdout.write(`Importing ${path.basename(filePath)}… `);
    try {
      const { inserted, skipped, total } = await importFile(filePath);
      markImported(filePath);
      totalInserted += inserted;
      totalSkipped  += skipped;
      console.log(`${inserted} inserted, ${skipped} skipped (${total} total)`);
    } catch (e) {
      console.error(`\n  ✗ Failed: ${e.message}`);
      await pool.end();
      process.exit(1);
    }
  }

  console.log(`\nDone: ${totalInserted} inserted, ${totalSkipped} duplicate skips`);
  console.log(`Next step: review cards then run:`);
  console.log(`  UPDATE source_cards SET reviewed = true WHERE subject = 'AP Chemistry' AND reviewed = false;`);

  await pool.end();
}

main();
