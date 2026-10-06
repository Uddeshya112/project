import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { spawn, type ChildProcess } from 'child_process';

const ROOT = process.cwd();
const BASE_URL = 'http://127.0.0.1:3000';
let ownedServer: ChildProcess | null = null;

const randomTestPassword = () => crypto.randomBytes(24).toString('base64url') + 'A1!';
const commandName = (command: string) => process.platform === 'win32' ? command + '.cmd' : command;

async function isServerReady(): Promise<boolean> {
  try {
    const response = await fetch(BASE_URL + '/api/health/live');
    if (!response.ok) return false;
    const body = await response.json().catch(() => null);
    return body?.status === 'LIVE';
  } catch {
    return false;
  }
}

async function waitForServer(timeoutMs = 30000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await isServerReady()) return;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('Timed out waiting for the local test server on port 3000.');
}

function startServer(seedPassword: string): ChildProcess {
  const child = spawn(commandName('tsx'), ['server.ts'], {
    cwd: ROOT,
    env: { ...process.env, NODE_ENV: 'test', PORT: '3000', SEED_USER_PASSWORD: seedPassword },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.on('data', chunk => process.stdout.write('[test-server] ' + chunk));
  child.stderr?.on('data', chunk => process.stderr.write('[test-server] ' + chunk));
  return child;
}

function stopServer(): Promise<void> {
  return new Promise(resolve => {
    if (!ownedServer || ownedServer.exitCode !== null) return resolve();
    const child = ownedServer;
    const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 5000);
    child.once('exit', () => { clearTimeout(timer); resolve(); });
    child.kill('SIGTERM');
  });
}

async function runCommand(command: string, args: string[], env?: NodeJS.ProcessEnv): Promise<number> {
  return new Promise(resolve => {
    const child = spawn(commandName(command), args, {
      cwd: ROOT,
      env: env ? { ...process.env, ...env } : process.env,
      stdio: 'inherit',
    });
    child.once('error', err => { console.error('Failed to start ' + command + ':', err); resolve(1); });
    child.once('exit', code => resolve(code ?? 1));
  });
}

async function main(): Promise<void> {
  const testDir = path.join(ROOT, 'tests');
  const testFiles = fs.readdirSync(testDir)
    .filter(name => name.endsWith('.test.ts'))
    .sort()
    .map(name => path.join('tests', name));

  let seedPassword = process.env.SEED_USER_PASSWORD;

  try {
    if (await isServerReady()) {
      if (!seedPassword) {
        throw new Error('SEED_USER_PASSWORD must be set when reusing an already-running test server.');
      }
    } else {
      seedPassword = seedPassword || randomTestPassword();
      ownedServer = startServer(seedPassword);
      await waitForServer();
    }

    const testEnv = { NODE_ENV: 'test', SEED_USER_PASSWORD: seedPassword };
    const unitExit = await runCommand('tsx', ['--test', ...testFiles], testEnv);
    if (unitExit !== 0) {
      process.exitCode = unitExit;
      return;
    }

    process.exitCode = await runCommand('tsx', ['scripts/run_e2e_tests.ts'], testEnv);
  } finally {
    await stopServer();
    ownedServer = null;
  }
}

main().catch(async err => {
  console.error(err);
  await stopServer();
  process.exit(1);
});
