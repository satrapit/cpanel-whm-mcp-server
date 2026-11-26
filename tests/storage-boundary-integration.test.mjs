import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { MySql2PreparedReadSql } from '../dist-core/connections/mysql2-read-sql.js';
import { MySqlReadConnectionRepository } from '../dist-core/connections/mysql-read-repository.js';
import { MySqlEncryptedCredentialVault } from '../dist-core/connections/mysql-encrypted-vault.js';
import { authorizeConnection, AuthorizationError } from '../dist-core/connections/connection.js';
import { encryptCredential } from '../dist-core/security/credential-envelope.js';
import { CONNECTION_READ_SQL } from '../dist-core/connections/connection-queries.js';
import { CREDENTIAL_LOOKUP_SQL } from '../dist-core/connections/credential-lookup-query.js';

const principal = { tenantId: 'tenant1', sub: 'synthetic-subject', scopes: ['mcp:read'] };
const connectionId = 'b6f882cc-c274-4eb3-9d02-3a76c5bc0a48';
const scope = { tenantId: principal.tenantId, connectionId };
const credentialRef = 'credential-1';
const kek = randomBytes(32);
const keyWrapper = {
  async wrapKey(key) {
    const nonce = randomBytes(12), cipher = createCipheriv('aes-256-gcm', kek, nonce);
    return { keyId: 'synthetic-kms-1', wrappedKey: Buffer.concat([nonce, cipher.update(key), cipher.final(), cipher.getAuthTag()]) };
  },
  async unwrapKey(id, blob) {
    if (id !== 'synthetic-kms-1') throw new Error('no key');
    const decipher = createDecipheriv('aes-256-gcm', kek, blob.subarray(0,12));
    decipher.setAuthTag(blob.subarray(-16));
    return Buffer.concat([decipher.update(blob.subarray(12,-16)), decipher.final()]);
  },
};
const encrypted = await encryptCredential('fake-api-token', scope, keyWrapper);

function makeBoundary({ revoked = false, crossTenant = false } = {}) {
  const calls = [];
  const pool = {
    async execute(sql, values) {
      calls.push({ sql, values });
      const allowedTenant = values[0] === principal.tenantId;
      let rows = [];
      if (allowedTenant && sql === CONNECTION_READ_SQL.MEMBER && values[1] === principal.sub) rows = [{allowed: 1}];
      if (allowedTenant && sql === CONNECTION_READ_SQL.GRANT && values[1] === principal.sub && !revoked) rows = [{allowed: 1}];
      if (allowedTenant && sql === CONNECTION_READ_SQL.GET) rows = [{id:connectionId,tenant_id:crossTenant ? 'tenant2' : principal.tenantId,
        kind:'cpanel',hostname:'demo.example.com',username:'demo',credential_ref:credentialRef,enabled:1}];
      if (allowedTenant && sql === CONNECTION_READ_SQL.CAPABILITIES) rows = [{capability:'cpanel.domains.list'}];
      if (allowedTenant && sql === CREDENTIAL_LOOKUP_SQL && values[2] === credentialRef && !revoked) rows = [{
        tenant_id:principal.tenantId,connection_id:connectionId,credential_ref:credentialRef,
        version:1,key_id:encrypted.keyId,wrapped_key:encrypted.wrappedKey,
        nonce:encrypted.nonce,ciphertext:encrypted.ciphertext,tag:encrypted.tag,
      }];
      return [rows, []];
    },
  };
  const db = new MySql2PreparedReadSql(pool);
  return { repo: new MySqlReadConnectionRepository(db), vault:new MySqlEncryptedCredentialVault(db,keyWrapper),calls };
}

test('read-only vertical slice: scoped membership, capability, grant and encrypted token', async () => {
  const {repo,vault,calls} = makeBoundary();
  const conn = await authorizeConnection(repo,principal,connectionId,'cpanel','cpanel.domains.list');
  assert.equal(await vault.getSecret(conn.credentialRef,{tenantId:principal.tenantId,connectionId:conn.id}), 'fake-api-token');
  assert.equal(calls.length,5);
  assert.ok(calls.every(c => c.values[0] === principal.tenantId));
  assert.ok(calls.every(c => !c.sql.includes('synthetic-subject') && !c.sql.includes('fake-api-token')));
});

test('read-only vertical slice: tenant confusion and revoked grant deny before vault access', async () => {
  for (const options of [{crossTenant:true},{revoked:true}]) {
    const {repo,vault,calls} = makeBoundary(options);
    await assert.rejects(authorizeConnection(repo,principal,connectionId,'cpanel','cpanel.domains.list'),AuthorizationError);
    assert.ok(calls.every(c => c.sql !== CREDENTIAL_LOOKUP_SQL));
  }
  const {repo,calls} = makeBoundary();
  await assert.rejects(authorizeConnection(repo,{...principal,tenantId:'tenant2'},connectionId,'cpanel','cpanel.domains.list'),AuthorizationError);
  assert.ok(calls.every(c => c.values[0] === 'tenant2'));
});
