import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { request as httpRequest } from 'node:http';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(new URL('..', import.meta.url));
let child;
let port;
let base;

before(async () => {
  const allocator = createServer();
  allocator.listen(0, '127.0.0.1');
  await once(allocator, 'listening');
  port = allocator.address().port;
  allocator.close();
  await once(allocator, 'close');
  base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ['scripts/local-preview.mjs'], {
    cwd: directory,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PREVIEW_PORT: String(port), NODE_ENV: 'test' },
  });
  let startTimeout;
  try { await Promise.race([
    new Promise((resolve, reject) => {
      child.stdout.on('data', data => {
        if (String(data).includes('LOCAL_DIAGNOSTIC_READY')) resolve();
      });
      child.once('exit', code => reject(new Error(`Preview exited with ${code}`)));
      child.once('error', reject);
    }),
    new Promise((_, reject) => { startTimeout = setTimeout(() => reject(new Error('Preview failed to start')), 3000); }),
  ]); } finally { clearTimeout(startTimeout); }
});

after(async () => {
  if (child && child.exitCode === null) {
    child.kill('SIGTERM');
    await once(child, 'exit');
  }
});

const rawGetWithHost = host => new Promise((resolve, reject) => {
  const req = httpRequest({ hostname: '127.0.0.1', port, path: '/health', headers: { Host: host } }, res => {
    res.resume(); res.on('end', () => resolve(res.statusCode));
  });
  req.on('error', reject);
  req.end();
});

const rpc = (method, params) => fetch(`${base}/preview/rpc`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ jsonrpc: '2.0', id: 7, method, ...(params ? { params } : {}) }),
});

test('dashboard is served over actual localhost HTTP with strict security headers', async () => {
  const response = await fetch(base);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-security-policy'), /default-src 'none'/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const html = await response.text();
  assert.match(html, /Diagnostic only/);
  assert.match(html, /HTTP \/ JSON-RPC walkthrough/);
  for (const asset of ['/preview.js', '/preview.css']) {
    const res = await fetch(base + asset);
    assert.equal(res.status, 200);
    assert.ok((await res.text()).length > 300);
  }
});

test('health and version respond with actual process information and disabled upstream status', async () => {
  const health = await (await fetch(`${base}/health`)).json();
  const version = await (await fetch(`${base}/version`)).json();
  assert.equal(health.status, 'ok');
  assert.equal(health.upstreamConnections, 'disabled');
  assert.equal(health.oauth, 'not_enabled');
  assert.match(version.version, /^0\.1\.0-alpha\.1$/);
  assert.equal(version.node, process.versions.node);
});

test('synthetic JSON-RPC walkthrough runs over actual HTTP with bounded tools', async () => {
  const initialization = await (await rpc('initialize', { protocolVersion: '2026-07-28' })).json();
  assert.equal(initialization.id, 7);
  assert.equal(initialization.result.serverInfo.name, 'local-preview-diagnostic-only');
  const listed = await (await rpc('tools/list')).json();
  assert.deepEqual(listed.result.tools.map(t => t.name), ['preview_status']);
  const called = await (await rpc('tools/call', { name: 'preview_status', arguments: {} })).json();
  assert.equal(called.result.isError, false);
  assert.match(called.result.content[0].text, /"upstreamConnections":"disabled"/);
});

test('the real MCP path cannot be reached without OAuth in local diagnostic mode', async () => {
  const response = await fetch(`${base}/mcp`);
  assert.equal(response.status, 401);
  assert.match(response.headers.get('www-authenticate'), /invalid_token/);
  const withToken = await fetch(`${base}/mcp`, { headers: { Authorization: 'Bearer intentionally-invalid' } });
  assert.equal(withToken.status, 400);
  assert.equal((await withToken.json()).error, 'credentials_not_accepted_in_preview');
});

test('reject mismatched Host, browser Origin and invalid methods', async () => {
  // Node fetch normalizes Host; use a raw HTTP client to exercise DNS rebinding guards.
  assert.equal(await rawGetWithHost('attacker.example'), 403);
  const spoofedOrigin = await fetch(`${base}/health`, { headers: { Origin: 'https://attacker.example' } });
  assert.equal(spoofedOrigin.status, 403);
  const unknownMethod = await fetch(`${base}/preview/rpc`);
  assert.equal(unknownMethod.status, 404);
});

test('reject malformed, oversized and unauthorized JSON-RPC requests', async () => {
  const wrongType = await fetch(`${base}/preview/rpc`, { method: 'POST', body: '{}', headers: { 'Content-Type': 'text/plain' } });
  assert.equal(wrongType.status, 415);
  const badJson = await fetch(`${base}/preview/rpc`, { method: 'POST', body: '{', headers: { 'Content-Type': 'application/json' } });
  assert.equal(badJson.status, 400);
  const oversized = await fetch(`${base}/preview/rpc`, { method: 'POST', body: JSON.stringify({ data: 'x'.repeat(9000) }), headers: { 'Content-Type': 'application/json' } });
  assert.equal(oversized.status, 413);
  const badTool = await (await rpc('tools/call', { name: 'execute_shell', arguments: {} })).json();
  assert.equal(badTool.error.code, -32602);
  const nonexistent = await (await rpc('tools/listing')).json();
  assert.equal(nonexistent.error.code, -32601);
});

test('reject queries, non-local path attempts, and untrusted authorization headers', async () => {
  assert.equal((await fetch(`${base}/health?unsafe=yes`)).status, 404);
  assert.equal((await fetch(`${base}/health`, { headers: { Authorization: 'Bearer anything' } })).status, 400);
});
