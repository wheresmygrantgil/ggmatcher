const fs = require('fs');
const path = require('path');

function readJson(file) {
  const data = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  return JSON.parse(data);
}

function main() {
  const grants = readJson('grants.json');
  const matches = readJson('matches.json');

  if (!Array.isArray(grants) || grants.length === 0) {
    throw new Error('grants.json must be a non-empty array');
  }

  if (!Array.isArray(matches) || matches.length === 0) {
    throw new Error('matches.json must be a non-empty array');
  }

  // Verify each match references existing grants
  const grantIds = new Set(grants.map(g => g.grant_id));
  matches.forEach(m => {
    m.grants.forEach(id => {
      if (!grantIds.has(id)) {
        throw new Error(`Match for ${m.name} references missing grant ${id}`);
      }
    });
  });

  console.log('Data validation passed');
}

main();
