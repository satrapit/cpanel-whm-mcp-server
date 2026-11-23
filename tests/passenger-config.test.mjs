import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// This is a packaging contract only; full SDK loading requires installed runtime dependencies.
test('Passenger entry requires an isolated CommonJS output, not the source ESM build', () => {
  const bootstrap = readFileSync('app.cjs', 'utf8');
  const passenger = JSON.parse(readFileSync('tsconfig.passenger.json', 'utf8'));
  assert.match(bootstrap, /require\('\.\/dist-passenger\/main\.js'\)/);
  assert.equal(passenger.compilerOptions.module, 'CommonJS');
  assert.equal(passenger.compilerOptions.verbatimModuleSyntax, false);
});

test('packaging marker refuses absent builds and declares built output CommonJS', () => {
  const temp = mkdtempSync(join(tmpdir(), 'cpanel-mcp-passenger-'));
  const script = new URL('../scripts/mark-passenger-build.mjs', import.meta.url).pathname;
  try {
    let result = spawnSync(process.execPath, [script], { cwd: temp, encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    mkdirSync(join(temp, 'dist-passenger'));
    writeFileSync(join(temp, 'dist-passenger', 'main.js'), "'use strict';\n");
    result = spawnSync(process.execPath, [script], { cwd: temp, encoding: 'utf8' });
    assert.equal(result.status, 0);
    assert.deepEqual(JSON.parse(readFileSync(join(temp, 'dist-passenger', 'package.json'), 'utf8')), { type: 'commonjs' });
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
