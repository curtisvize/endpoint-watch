import { spawnSync } from 'node:child_process';

if (!process.env.TEST_DATABASE_URL) {
  console.error('TEST_DATABASE_URL is required; use a dedicated, migrated test database');
  process.exitCode = 1;
} else {
  const result = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', '.integration.test.ts'], {
    stdio: 'inherit', env: process.env,
  });
  if (result.error) console.error('Unable to start integration tests');
  process.exitCode = result.status ?? 1;
}
