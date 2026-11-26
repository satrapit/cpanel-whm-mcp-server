import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MySql2PreparedReadSql, DatabaseReadError } from '../dist-core/connections/mysql2-read-sql.js';
import { CONNECTION_READ_SQL } from '../dist-core/connections/connection-queries.js';
import { CREDENTIAL_LOOKUP_SQL } from '../dist-core/connections/credential-lookup-query.js';

test('mysql2 adapter executes only reviewed SQL with positional bindings', async () => {
  const calls = [];
  const adapter = new MySql2PreparedReadSql({
    async execute(sql, values) { calls.push({ sql, values }); return [[{ allowed: 1 }], []]; },
  });
  const rows = await adapter.select(CONNECTION_READ_SQL.MEMBER, ['tenant1', 'subject1']);
  assert.equal(rows[0].allowed, 1);
  assert.deepEqual(calls, [{ sql: CONNECTION_READ_SQL.MEMBER, values: ['tenant1', 'subject1'] }]);
  await adapter.select(CREDENTIAL_LOOKUP_SQL, ['tenant1', 'b6f882cc-c274-4eb3-9d02-3a76c5bc0a48', 'ref_1']);
  assert.equal(calls.length, 2);
  assert.equal(Object.isFrozen(rows[0]), true);
});

test('mysql2 adapter blocks unreviewed SQL and parameter mismatches before DB access', async () => {
  let called = 0;
  const adapter = new MySql2PreparedReadSql({ async execute() { called++; return [[], []]; } });
  const bad = [
    ['DELETE FROM mcp_connections', []],
    ['SELECT * FROM mcp_connections', []],
    [CONNECTION_READ_SQL.MEMBER + '; DROP TABLE mcp_connections', ['tenant1', 'subject1']],
    [CONNECTION_READ_SQL.MEMBER, ['tenant1']],
    [CONNECTION_READ_SQL.MEMBER, ['tenant1', 'sub', 'third']],
    [CONNECTION_READ_SQL.MEMBER, ['', 'sub']],
    [CONNECTION_READ_SQL.MEMBER, ['tenant1', 42]],
  ];
  for (const [sql, params] of bad) await assert.rejects(adapter.select(sql, params), DatabaseReadError);
  assert.equal(called, 0);
});

test('mysql2 adapter fails closed on malformed results, oversized sets and driver errors', async () => {
  for (const rows of [null, { affectedRows: 1 }, [null], [[]], Array.from({length:101}, () => ({id:'x'}))]) {
    const adapter = new MySql2PreparedReadSql({ async execute() { return [rows, []]; } });
    await assert.rejects(adapter.select(CONNECTION_READ_SQL.MEMBER, ['tenant1', 'sub']), DatabaseReadError);
  }
  const adapter = new MySql2PreparedReadSql({ async execute() { throw new Error('secret internal db password'); } });
  await assert.rejects(adapter.select(CONNECTION_READ_SQL.MEMBER, ['tenant1','sub']), e =>
    e instanceof DatabaseReadError && !e.message.includes('secret'));
});
