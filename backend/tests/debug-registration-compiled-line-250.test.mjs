import test from 'node:test';
import fs from 'node:fs';

const compiledPath = new URL('../dist/services/public-catalog-launch.service.js', import.meta.url);

test('print compiled registration failure context around line 250', () => {
  const lines = fs.readFileSync(compiledPath, 'utf8').split('\n');
  console.log('--- COMPILED REGISTRATION LINES 244-258 ---');
  for (let line = 244; line <= 258; line += 1) {
    console.log(`${line}: ${lines[line - 1] || ''}`);
  }
  console.log('--- END COMPILED REGISTRATION CONTEXT ---');
});
