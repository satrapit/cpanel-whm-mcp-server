import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authorizeConnection, AuthorizationError, DenyAllRepository } from '../dist-core/connections/connection.js';

const tenantId = 'tenant1';
const principal = { sub: 'alice', tenantId, scopes: ['mcp:read'] };
const connection = {
  id: 'conn1', tenantId, kind: 'cpanel', hostname: 'example.com', username: 'alice',
  credentialRef: 'opaque', enabled: true, verifiedCapabilities: ['cpanel.domains.list'],
};

test('connection lookups must always be tenant scoped', async () => {
  const calls = [];
  const repo = {
    async get(tenant, id) { calls.push(['get', tenant, id]); return connection; },
    async isMember(p, tenant) { calls.push(['member', p.sub, tenant]); return true; },
    async canAccess(p, id) { calls.push(['grant', p.sub, id]); return true; },
  };
  const result = await authorizeConnection(repo, principal, 'conn1', 'cpanel', 'cpanel.domains.list');
  assert.equal(result.id, 'conn1');
  assert.deepEqual(calls, [
    ['get', 'tenant1', 'conn1'],
    ['member', 'alice', 'tenant1'],
    ['grant', 'alice', 'conn1'],
  ]);
});

test('empty principal and missing scope reject before persistent storage lookups', async () => {
  let called = false;
  const repo = { async get() { called = true; return connection; } };
  for (const p of [{ ...principal, sub: '' }, { ...principal, tenantId: '' }, { ...principal, scopes: [] }]) {
    await assert.rejects(authorizeConnection(repo, p, 'conn1', 'cpanel', 'cpanel.domains.list'), AuthorizationError);
  }
  assert.equal(called, false);
});

test('deny-all repository cannot be used to enable an upstream connection', async () => {
  await assert.rejects(authorizeConnection(new DenyAllRepository(), principal, 'conn1', 'cpanel', 'cpanel.domains.list'), AuthorizationError);
});
