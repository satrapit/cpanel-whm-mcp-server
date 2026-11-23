import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseVerifiedClaims } from '../dist-core/auth/token-claims.js';

const resource = 'https://mcp.example.com/mcp';
const valid = () => ({
  sub: 'user1', tenant_id: 'tenant1', client_id: 'registered_client',
  exp: Math.floor(Date.now() / 1000) + 300, aud: resource, scope: 'mcp:read other:scope',
});

test('JWT claim parser distinguishes OAuth client and user while preserving strict scope', () => {
  const identity = parseVerifiedClaims(valid(), resource);
  assert.equal(identity.principal.sub, 'user1');
  assert.equal(identity.clientId, 'registered_client');
  assert.deepEqual(identity.principal.scopes, ['mcp:read', 'other:scope']);
  assert.equal(parseVerifiedClaims({ ...valid(), client_id: undefined, azp: 'other_client' }, resource).clientId, 'other_client');
});

test('JWT claim parser rejects missing, coerced, malformed or mismatched tenant and audience', () => {
  for (const bad of [
    { tenant_id: undefined }, { tenant_id: null }, { tenant_id: 123 },
    { tenant_id: 'another/tenant' }, { sub: 123 }, { sub: '' },
    { client_id: null, azp: undefined }, { exp: Infinity },
    { exp: Math.floor(Date.now() / 1000) - 20 },
    { aud: 'https://other.example/mcp' }, { aud: null },
  ]) assert.throws(() => parseVerifiedClaims({ ...valid(), ...bad }, resource), /INVALID_TOKEN_CLAIMS/);
  assert.equal(parseVerifiedClaims({ ...valid(), aud: [resource, 'https://other.example/mcp'] }, resource).principal.tenantId, 'tenant1');
});

test('missing or unsupported scope format grants no permissions', () => {
  for (const scope of [undefined, 123, ['mcp:read'], 'mcp:read'.repeat(520)]) {
    assert.deepEqual(parseVerifiedClaims({ ...valid(), scope }, resource).principal.scopes, []);
  }
});
