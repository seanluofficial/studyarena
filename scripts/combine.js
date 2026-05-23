/**
 * combine.js — merges per-unit JSON files into a single subject file
 *
 * Usage:
 *   node combine.js ../content/apchem/unit1.json ../content/apchem/unit2.json ...
 *     → writes ../content/apchem/apchem.json
 *
 *   node combine.js ../content/apchem/
 *     → combines all unit*.json files in the directory into apchem.json
 *
 *   node combine.js ../content/apchem/unit1_batch1.json ../content/apchem/unit1_batch2.json --out ../content/apchem/unit1.json
 *     → combines specific files into a named output file
 */

const fs   = require('fs');
const path = require('path');

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: node combine.js <file|directory> [...files] [--out <output.json>]');
    process.exit(1);
  }

  const outFlagIdx = args.indexOf('--out');
  let outFile = null;
  let inputs = args;

  if (outFlagIdx !== -1) {
    outFile = path.resolve(args[outFlagIdx + 1]);
    inputs = args.filter((_, i) => i !== outFlagIdx && i !== outFlagIdx + 1);
  }

  let files = [];

  for (const input of inputs) {
    const abs = path.resolve(input);
    const stat = fs.statSync(abs);
    if (stat.isDirectory()) {
      const dirFiles = fs.readdirSync(abs)
        .filter(f => f.match(/^unit\d+\.json$/) && !f.startsWith('apchem'))
        .sort((a, b) => {
          const na = parseInt(a.match(/\d+/)[0]);
          const nb = parseInt(b.match(/\d+/)[0]);
          return na - nb;
        })
        .map(f => path.join(abs, f));
      files.push(...dirFiles);

      if (!outFile) {
        const dirName = path.basename(abs);
        outFile = path.join(abs, `${dirName}.json`);
      }
    } else {
      files.push(abs);
    }
  }

  if (files.length === 0) {
    console.error('No unit*.json files found.');
    process.exit(1);
  }

  if (!outFile) {
    const dir = path.dirname(files[0]);
    const dirName = path.basename(dir);
    outFile = path.join(dir, `${dirName}.json`);
  }

  const combined = [];
  for (const f of files) {
    const cards = JSON.parse(fs.readFileSync(f, 'utf8'));
    combined.push(...cards);
    console.log(`  ${path.basename(f)}: ${cards.length} cards`);
  }

  fs.writeFileSync(outFile, JSON.stringify(combined, null, 2), 'utf8');
  console.log(`\nWrote ${combined.length} total cards → ${path.basename(outFile)}`);
}

main();
