import test from 'node:test';
import fs from 'node:fs';

const compiledPath = new URL('../dist/services/public-catalog-launch.service.js', import.meta.url);

test('print compiled registration failure context', () => {
  const lines = fs.readFileSync(compiledPath, 'utf8').split('\n');
  const from = 232;
  const to = 246;
  console.log('--- COMPILED REGISTRATION LINES 232-246 ---');
  for (let line = from; line <= to; line += 1) {
    console.log(`${line}: ${lines[line - 1] || ''}`);
  }
  console.log('--- END COMPILED REGISTRATION CONTEXT ---');
});
