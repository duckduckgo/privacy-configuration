import { readFile } from 'fs/promises';
import { resolve } from 'path';

async function readJSON(filePath) {
  try {
    const fullPath = resolve(filePath);
    const data = await readFile(fullPath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error(`Failed to read or parse JSON from ${filePath}:`, err.message);
    process.exit(1);
  }
}

function getPath(json, pathStr) {
  if (!pathStr) return json;
  const keys = pathStr.split('.');
  let current = json;
  for (const key of keys) {
    if (current && typeof current === 'object' && key in current) {
      current = current[key];
    } else {
      console.error(`❌ Path "${pathStr}" not found in one of the files.`);
      process.exit(1);
    }
  }
  return current;
}

function isObject(val) {
  return val && typeof val === 'object' && !Array.isArray(val);
}

function compareObjects(obj1, obj2) {
  const keys1 = Object.keys(obj1 || {});
  const keys2 = Object.keys(obj2 || {});

  const onlyIn1 = keys1.filter(k => !keys2.includes(k));
  const onlyIn2 = keys2.filter(k => !keys1.includes(k));
  const inBoth = keys1.filter(k => keys2.includes(k));

  const differing = inBoth.filter(k => JSON.stringify(obj1[k]) !== JSON.stringify(obj2[k]));

  return { onlyIn1, onlyIn2, differing };
}

function compareTopLevelKeys(json1, json2) {
  const keys1 = Object.keys(json1);
  const keys2 = Object.keys(json2);

  const onlyInFile1 = keys1.filter(k => !keys2.includes(k));
  const onlyInFile2 = keys2.filter(k => !keys1.includes(k));
  const inBoth = keys1.filter(k => keys2.includes(k));

  const differingValues = [];

  inBoth.forEach(k => {
    if (JSON.stringify(json1[k]) !== JSON.stringify(json2[k])) {
      let subDiff = null;
      if (isObject(json1[k]) && isObject(json2[k])) {
        subDiff = compareObjects(json1[k], json2[k]);
      }
      differingValues.push({ key: k, subDiff });
    }
  });

  return { onlyInFile1, onlyInFile2, differingValues };
}

function printDifferences(diff, pathStr) {
  const label = pathStr ? `Path: "${pathStr}"` : 'Top level';
  console.log(`🔍 JSON Comparison at ${label}:\n`);

  if (diff.onlyInFile1.length > 0) {
    console.log('📁 Keys only in File 1:');
    diff.onlyInFile1.forEach(k => console.log(`  - ${k}`));
  }

  if (diff.onlyInFile2.length > 0) {
    console.log('\n📁 Keys only in File 2:');
    diff.onlyInFile2.forEach(k => console.log(`  - ${k}`));
  }

  if (diff.differingValues.length > 0) {
    console.log('\n🔄 Keys with differing values:');
    diff.differingValues.forEach(({ key, subDiff }) => {
      console.log(`  - ${key}`);
      if (subDiff) {
        if (subDiff.onlyIn1.length > 0) {
          console.log(`    🔸 Subkeys only in File 1:`);
          subDiff.onlyIn1.forEach(sk => console.log(`      - ${sk}`));
        }
        if (subDiff.onlyIn2.length > 0) {
          console.log(`    🔸 Subkeys only in File 2:`);
          subDiff.onlyIn2.forEach(sk => console.log(`      - ${sk}`));
        }
        if (subDiff.differing.length > 0) {
          console.log(`    🔸 Subkeys with differing values:`);
          subDiff.differing.forEach(sk => console.log(`      - ${sk}`));
        }
      } else {
        console.log(`    (value is not a comparable object or is primitive/array)`);
      }
    });
  }

  if (
    diff.onlyInFile1.length === 0 &&
    diff.onlyInFile2.length === 0 &&
    diff.differingValues.length === 0
  ) {
    console.log('✅ The keys and values at this level match.');
  }
}

// === CLI entry point ===

const [,, file1, file2, pathStr] = process.argv;

if (!file1 || !file2) {
  console.error('Usage: node compare-json.mjs <file1.json> <file2.json> [path.to.nested.key]');
  process.exit(1);
}

const json1 = await readJSON(file1);
const json2 = await readJSON(file2);

const target1 = getPath(json1, pathStr);
const target2 = getPath(json2, pathStr);

const differences = compareTopLevelKeys(target1, target2);
printDifferences(differences, pathStr);
