import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
// Apply Drizzle migrations once to the same local storage used by Vite.
const wrangler = resolve('node_modules/wrangler/bin/wrangler.js');
const args = [
  'd1',
  'execute',
  'DB',
  '--local',
  '--config',
  'dist/server/wrangler.json',
  '--persist-to',
  resolve(process.env.CAMP_DB_TEST_STATE ?? '.wrangler/state'),
  '--json',
];
function query(sql) {
  const result = spawnSync(
    process.execPath,
    [wrangler, ...args, '--command', sql],
    { encoding: 'utf8' },
  );
  if (result.status !== 0) throw Error(result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}
query(
  'CREATE TABLE IF NOT EXISTS local_game_migrations (name TEXT PRIMARY KEY)',
);
for (const name of readdirSync('drizzle')
  .filter((n) => /^\d{4}_[a-z_]+\.sql$/.test(n))
  .sort()) {
  const rows = query(
    `SELECT name FROM local_game_migrations WHERE name = '${name}'`,
  );
  if (rows[0].results.length) continue;
  const result = spawnSync(
    process.execPath,
    [wrangler, ...args, '--file', resolve('drizzle', name)],
    { encoding: 'utf8' },
  );
  if (result.status !== 0) throw Error(result.stderr || result.stdout);
  query(`INSERT INTO local_game_migrations (name) VALUES ('${name}')`);
  console.log(`Applied ${name}`);
}
