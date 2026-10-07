import { performance } from 'node:perf_hooks';
import { hashPasswordBcryptSync, verifyPasswordSync } from '../src/lib/passwordUtils';

const password = 'Benchmark!2026Password';
const iterations = 3;
const started = performance.now();
let hash = '';
for (let i = 0; i < iterations; i += 1) hash = hashPasswordBcryptSync(password);
const hashMs = performance.now() - started;
const verifyStarted = performance.now();
for (let i = 0; i < iterations; i += 1) {
  const result = verifyPasswordSync(password, hash);
  if (!result.isValid) throw new Error('Password verification benchmark failed.');
}
const verifyMs = performance.now() - verifyStarted;
console.log(`bcrypt hash: ${hashMs.toFixed(1)} ms total / ${(hashMs / iterations).toFixed(1)} ms each`);
console.log(`bcrypt verify: ${verifyMs.toFixed(1)} ms total / ${(verifyMs / iterations).toFixed(1)} ms each`);
