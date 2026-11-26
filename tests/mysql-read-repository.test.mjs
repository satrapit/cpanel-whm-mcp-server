import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MySqlReadConnectionRepository } from '../dist-core/connections/mysql-read-repository.js';

const id = 'b6f882cc-c274-4eb3-9d02-3a76c5bc0a48';
const principal = { sub: 'idp|alice@example.com', tenantId: 'tenant-A', scopes: ['mcp:read'] };
const row = {
  tenant_id: 'tenant-A', id, kind: 'cpanel', hostname: 'host.example.com',
  username: 'demo', credential_ref: 'vault-ref-01', enabled: 1,
};
function mockDb(overrides = {}) {
  const calls = [];
  return {
    calls,
    async select(sql, params) {
      calls.push({ sql, params });
      assert.equal(sql.includes('?'), true, 'all queries must have bound arguments');
      assert.equal(sql.includes(principal.sub), false, 'subject cannot be interpolated in SQL');
      if (sql.includes('FROM mcp_tenant_memberships\n')) return overrides.members ?? [{ allowed: 1 }];
      if (sql.includes('FROM mcp_connection_grants AS g')) return overrides.grants ?? [{ allowed: 1 }];
      if (sql.includes('FROM mcp_connections WHERE')) return overrides.connection ?? [row];
      if (sql.includes('FROM mcp_connection_capabilities')) return overrides.capabilities ?? [{ capability: 'cpanel.domains.list' }];
      if (sql.includes('FROM mcp_connections AS c')) return overrides.list ?? [{ id }];
      throw new Error('Unexpected SQL: ' + sql);
    },
  };
}

test('reads are explicitly scoped by tenant, subject, connection and never interpolate identities', async () => {
  const db = mockDb();
  const repo = new MySqlReadConnectionRepository(db);
  assert.equal(await repo.isMember(principal, principal.tenantId), true);
  assert.equal(await repo.canAccess(principal, id), true);
  const connection = await repo.get(principal.tenantId, id);
  assert.deepEqual(connection?.verifiedCapabilities, ['cpanel.domains.list']);
  assert.equal(connection?.credentialRef, 'vault-ref-01');
  assert.deepEqual(db.calls[0].params, ['tenant-A', principal.sub]);
  assert.deepEqual(db.calls[1].params, ['tenant-A', principal.sub, id]);
  assert.deepEqual(db.calls[2].params, ['tenant-A', id]);
  assert.deepEqual(db.calls[3].params, ['tenant-A', id]);
});

test('rejects cross-tenant, missing scope and malformed connection IDs before SQL', async () => {
  const db = mockDb();
  const repo = new MySqlReadConnectionRepository(db);
  assert.equal(await repo.isMember(principal, 'tenant-B'), false);
  assert.equal(await repo.canAccess({ ...principal, scopes: [] }, id), false);
  assert.equal(await repo.get('tenant-A', 'not-a-uuid'), null);
  assert.equal(await repo.canAccess(principal, "x' OR 1=1 --"), false);
  assert.deepEqual(await repo.list({ ...principal, sub: '' }), []);
  assert.equal(db.calls.length, 0);
});

test('rejects forged cross-tenant rows, invalid hosts and wrong provider capabilities', async () => {
  for (const overrides of [
    { connection: [{ ...row, tenant_id: 'tenant-B' }] },
    { connection: [{ ...row, hostname: 'localhost' }] },
    { connection: [{ ...row, credential_ref: '../secret' }] },
    { capabilities: [{ capability: 'whm.accounts.list' }] },
    { capabilities: [{ capability: 'cpanel.domains.list' }, { capability: 'cpanel.domains.list' }] },
  ]) {
    const repo = new MySqlReadConnectionRepository(mockDb(overrides));
    assert.equal(await repo.get(principal.tenantId, id), null);
  }
});

test('listing is bounded and rechecks membership and per-connection grants', async () => {
  const db = mockDb();
  const repo = new MySqlReadConnectionRepository(db);
  const list = await repo.list(principal);
  assert.equal(list.length, 1);
  assert.equal(list[0].id, id);
  assert.ok(db.calls.some(c => c.sql.includes('ORDER BY c.id LIMIT 50')));
  assert.equal((await new MySqlReadConnectionRepository(mockDb({ members: [] })).list(principal)).length, 0);
  assert.equal((await new MySqlReadConnectionRepository(mockDb({ grants: [] })).list(principal)).length, 0);
});

test('not-enabled and inconsistent DB grant records fail closed', async () => {
  assert.equal(await new MySqlReadConnectionRepository(mockDb({ grants: [] })).canAccess(principal, id), false);
  assert.equal(await new MySqlReadConnectionRepository(mockDb({ connection: [{ ...row, enabled: 0 }] })).get(principal.tenantId, id).then(c => c?.enabled), false);
  const repo = new MySqlReadConnectionRepository(mockDb({ connection: [{ ...row, enabled: 0 }] }));
  assert.deepEqual(await repo.list(principal), []);
});
