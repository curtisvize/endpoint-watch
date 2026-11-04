import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const web = fileURLToPath(new URL('..', import.meta.url));
const project = `endpoint-watch-e2e-${randomBytes(6).toString('hex')}`;
const temporary = mkdtempSync(join(tmpdir(), 'endpoint-watch-e2e-'));
const envFile = join(temporary, 'compose.env');
const env = { ...process.env, COMPOSE_PROFILES: '', POSTGRES_PASSWORD: randomBytes(24).toString('hex'),
  POSTGRES_USER: 'endpoint_watch', POSTGRES_DB: 'endpoint_watch_e2e', API_PORT: '0', WEB_PORT: '0',
  MONITOR_TIMEOUT_MS: '5000', MOCK_DELAY_MS: '6000' };
writeFileSync(envFile, '', { mode: 0o600 });
const compose = ['compose', '--project-name', project, '--env-file', envFile,
  '-f', 'compose.yaml', '-f', 'compose.e2e.yaml'];
let interrupted = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { interrupted = true; });
function docker(args, capture = false, input) {
  const result = spawnSync('docker', [...compose, ...args], { cwd: root, env,
    encoding: 'utf8', input, stdio: capture || input ? ['pipe', 'pipe', 'pipe'] : 'inherit', timeout: 300000 });
  if (result.error || result.status !== 0 || interrupted) throw new Error('E2E Docker command failed; check Docker availability and service logs');
  return result.stdout?.trim();
}
console.log(`Disposable E2E Compose project: ${project}`);
try {
  docker(['up', '-d', '--build', '--wait', '--wait-timeout', '180', 'postgres', 'migrate', 'mock-api', 'api', 'web']);
  const fixtures = readFileSync(new URL('../e2e/fixtures.sql', import.meta.url), 'utf8');
  docker(['exec', '-T', 'postgres', 'psql', '-X', '-U', env.POSTGRES_USER, '-d', env.POSTGRES_DB, '-v', 'ON_ERROR_STOP=1'], true, fixtures);
  const address = docker(['port', 'web', '8080'], true);
  const result = spawnSync(process.execPath, ['node_modules/@playwright/test/cli.js', 'test'], {
    cwd: web, env: { ...env, PLAYWRIGHT_BASE_URL: `http://${address}` }, stdio: 'inherit',
  });
  process.exitCode = interrupted ? 130 : result.status ?? 1;
} catch (error) {
  console.error(error.message);
  spawnSync('docker', [...compose, 'logs', '--no-color', '--tail=60'], { cwd: root, env, stdio: 'inherit', timeout: 15000 });
  process.exitCode = 1;
} finally {
  const cleanup = spawnSync('docker', [...compose, 'down', '--volumes', '--remove-orphans'], { cwd: root, env, stdio: 'inherit', timeout: 60000 });
  if (cleanup.status !== 0) { console.error(`Cleanup failed for ${project}; remove only this disposable project manually`); process.exitCode = 1; }
  rmSync(temporary, { recursive: true, force: true });
}
