import { performance } from 'perf_hooks';
import {
  hashPasswordBcrypt,
  hashPasswordScrypt,
  hashPasswordLegacy,
  verifyPassword,
} from '../src/lib/passwordUtils';
import { generateTimetableFromConfiguration } from '../src/lib/timetableGenerator';
import {
  INITIAL_ACADEMIC_YEAR,
  INITIAL_ALLOCATIONS,
  FACULTY_MEMBERS,
  ROOMS,
  SECTIONS,
  COURSES,
  INITIAL_CONSTRAINTS
} from '../src/lib/initialData';

function calculatePercentile(latencies: number[], percentile: number): number {
  const sorted = [...latencies].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return Number((sorted[Math.max(0, index)] || 0).toFixed(2));
}

async function runBenchmarks() {
  console.log('================================================================');
  console.log('INTELLISCHEDULE SECURITY KDF & SYSTEM PERFORMANCE BENCHMARKS');
  console.log('================================================================\n');

  const testPassword = 'ThaparUniversity#2026!Secure';

  // -------------------------------------------------------------
  // BENCHMARK 1: PASSWORD HASHING KEY DERIVATION FUNCTIONS
  // -------------------------------------------------------------
  console.log('--- 1. Password KDF Execution Latency & Workload Cost ---');

  // 1a. Bcrypt Cost Factor 10
  const bcrypt10Times: number[] = [];
  for (let i = 0; i < 5; i++) {
    const t0 = performance.now();
    hashPasswordBcrypt(testPassword, 10);
    bcrypt10Times.push(performance.now() - t0);
  }
  const bcrypt10P50 = calculatePercentile(bcrypt10Times, 50);
  const bcrypt10P95 = calculatePercentile(bcrypt10Times, 95);
  console.log(`  • Bcrypt (Cost 10 - Fast):        p50 = ${bcrypt10P50} ms | p95 = ${bcrypt10P95} ms`);

  // 1b. Bcrypt Cost Factor 12 (Production Target)
  const bcrypt12Times: number[] = [];
  for (let i = 0; i < 5; i++) {
    const t0 = performance.now();
    hashPasswordBcrypt(testPassword, 12);
    bcrypt12Times.push(performance.now() - t0);
  }
  const bcrypt12P50 = calculatePercentile(bcrypt12Times, 50);
  const bcrypt12P95 = calculatePercentile(bcrypt12Times, 95);
  console.log(`  • Bcrypt (Cost 12 - Production):  p50 = ${bcrypt12P50} ms | p95 = ${bcrypt12P95} ms`);

  // 1c. Scrypt (N=16384, r=8, p=1)
  const scryptTimes: number[] = [];
  for (let i = 0; i < 10; i++) {
    const t0 = performance.now();
    hashPasswordScrypt(testPassword);
    scryptTimes.push(performance.now() - t0);
  }
  const scryptP50 = calculatePercentile(scryptTimes, 50);
  const scryptP95 = calculatePercentile(scryptTimes, 95);
  console.log(`  • Scrypt (N=16384, r=8, p=1):     p50 = ${scryptP50} ms | p95 = ${scryptP95} ms`);

  // 1d. Legacy Salted SHA-256 (Insecure Baseline)
  const sha256Times: number[] = [];
  for (let i = 0; i < 20; i++) {
    const t0 = performance.now();
    hashPasswordLegacy(testPassword);
    sha256Times.push(performance.now() - t0);
  }
  const sha256P50 = calculatePercentile(sha256Times, 50);
  const sha256P95 = calculatePercentile(sha256Times, 95);
  console.log(`  • Legacy Salted SHA-256:          p50 = ${sha256P50} ms | p95 = ${sha256P95} ms`);

  // -------------------------------------------------------------
  // BENCHMARK 2: ON-THE-FLY REHASH MIGRATION TIMING
  // -------------------------------------------------------------
  console.log('\n--- 2. On-The-Fly Password Migration Workflow Benchmark ---');
  const legacyHash = hashPasswordLegacy(testPassword);
  
  const migrationTimes: number[] = [];
  for (let i = 0; i < 5; i++) {
    const t0 = performance.now();
    // Verify legacy password
    const result = verifyPassword(testPassword, legacyHash);
    if (result.isValid && result.needsRehash) {
      // Execute upgrade
      hashPasswordBcrypt(testPassword, 12);
    }
    migrationTimes.push(performance.now() - t0);
  }
  const migP50 = calculatePercentile(migrationTimes, 50);
  const migP95 = calculatePercentile(migrationTimes, 95);
  console.log(`  • Legacy Verification + Rehash:   p50 = ${migP50} ms | p95 = ${migP95} ms`);
  console.log(`    (Transparently upgrades legacy hash on next user login)`);

  // -------------------------------------------------------------
  // BENCHMARK 3: HTTP API LATENCY (LIVE SERVER)
  // -------------------------------------------------------------
  console.log('\n--- 3. HTTP API Latency & Throughput Benchmarks ---');
  const BASE_URL = 'http://localhost:3000';

  const healthTimes: number[] = [];
  for (let i = 0; i < 30; i++) {
    const t0 = performance.now();
    const res = await fetch(`${BASE_URL}/api/health/live`);
    await res.json();
    healthTimes.push(performance.now() - t0);
  }
  const healthP50 = calculatePercentile(healthTimes, 50);
  const healthP95 = calculatePercentile(healthTimes, 95);
  const healthP99 = calculatePercentile(healthTimes, 99);
  console.log(`  • GET /api/health/live:           p50 = ${healthP50} ms | p95 = ${healthP95} ms | p99 = ${healthP99} ms`);

  // -------------------------------------------------------------
  // BENCHMARK 4: TIMETABLE CONSTRAINT SOLVER BENCHMARK
  // -------------------------------------------------------------
  console.log('\n--- 4. Master Timetable Generation Engine Benchmark ---');
  const solverTimes: number[] = [];
  for (let i = 0; i < 20; i++) {
    const t0 = performance.now();
    generateTimetableFromConfiguration(
      INITIAL_ACADEMIC_YEAR,
      INITIAL_ALLOCATIONS,
      FACULTY_MEMBERS,
      ROOMS,
      SECTIONS,
      COURSES,
      INITIAL_CONSTRAINTS
    );
    solverTimes.push(performance.now() - t0);
  }
  const solverP50 = calculatePercentile(solverTimes, 50);
  const solverP95 = calculatePercentile(solverTimes, 95);
  const solverP99 = calculatePercentile(solverTimes, 99);
  console.log(`  • Full Conflict-Free Solver:      p50 = ${solverP50} ms | p95 = ${solverP95} ms | p99 = ${solverP99} ms`);
  console.log('================================================================\n');
}

runBenchmarks().catch(err => {
  console.error('Benchmark execution error:', err);
  process.exit(1);
});
