import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const sourcePath = 'backend/scripts/qa-gym-live-certification.mjs';
const generatedPath = '.gym-live-certification.generated.mjs';
let source = fs.readFileSync(sourcePath, 'utf8');
source = source.replace("const failures = [];", "const failures = [];\nlet requestSeq = 0;");
const unsafe = "'Idempotency-Key': `${runId}:${method}:${path}:${Math.random().toString(36).slice(2)}`,";
const safe = "'Idempotency-Key': `gym-${Date.now()}-${++requestSeq}-${Math.random().toString(36).slice(2, 10)}`,";
if (!source.includes(unsafe)) throw new Error('Gym audit transformer could not locate idempotency header');
source = source.replace(unsafe, safe);
fs.writeFileSync(generatedPath, source);
const result = spawnSync(process.execPath, [generatedPath], { stdio: 'inherit', env: process.env });
fs.rmSync(generatedPath, { force: true });
if (result.status !== 0) process.exit(result.status || 1);
