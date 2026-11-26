import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createResourceAuthorization } from '../dist-core/auth/resource-policy.js';

const resource = 'https://mcp.example.com/mcp';
const valid = () => ({
  principal: { sub: 'user_1', tenantId: 'tenant_1', scopes: ['mcp:read'] },
  clientId: 'trusted_oauth_client', expiresAt: Math.floor(Date.now() / 1000) + 600,
  resource: new URL(resource),
});

const create = verifier => createResourceAuthorization(resource, verifier);

test('metadata URL follows the exact MCP protected resource path', () => {
  const gate = create(async () => valid());
  assert.equal(gate.metadataUrl, 'https://mcp.example.com/.well-known/oauth-protected-resource/mcp');
  assert.equal(gate.resource, resource);
  for (const bad of ['http://other.example/mcp', 'https://example.com/other', 'https://name:secret@example.com/mcp', 'https://example.com/mcp?token=x']) {
    assert.throws(() => createResourceAuthorization(bad, async () => valid()), TypeError);
  }
});

test('reject missing, malformed, duplicate or oversized headers before verifier', async () => {
  let calls = 0;
  const gate = create(async () => { calls++; return valid(); });
  for (const value of [undefined, '', 'Basic secret', 'Bearer ', 'Bearer bad\nAuthorization: good', 'Bearer a, Bearer b', 'Bearer ' + 'A'.repeat(8192)]) {
    const result = await gate.authorize(value);
    assert.equal(result.ok, false);
    assert.equal(result.status, 401);
    assert.equal(result.code, 'invalid_token');
    assert.match(result.challenge, /resource_metadata=/);
    assert.equal(result.challenge.includes('secret'), false);
  }
  assert.equal(calls, 0);
});

test('signed identity still requires exact resource, expiry, user/client distinction and tenant', async () => {
  for (const credential of [
    { ...valid(), resource: new URL('https://other.example/mcp') },
    { ...valid(), expiresAt: Math.floor(Date.now() / 1000) - 10 },
    { ...valid(), clientId: '' },
    { ...valid(), principal: { ...valid().principal, tenantId: 'evil/tenant' } },
    { ...valid(), principal: { ...valid().principal, sub: '' } },
  ]) {
    const result = await create(async () => credential).authorize('Bearer syntactically.valid');
    assert.equal(result.status, 401);
  }
});

test('valid signed token lacking scope returns RFC 6750 insufficient_scope rather than invalid_token', async () => {
  const gate = create(async () => ({ ...valid(), principal: { ...valid().principal, scopes: ['other:read'] } }));
  const result = await gate.authorize('Bearer signed.fake.value');
  assert.equal(result.status, 403);
  assert.equal(result.code, 'insufficient_scope');
  assert.match(result.challenge, /scope="mcp:read"/);
});

test('successful authorized principal is preserved separately from OAuth client', async () => {
  const gate = create(async () => valid());
  const result = await gate.authorize('Bearer signed.fake.value');
  assert.equal(result.ok, true);
  assert.equal(result.identity.principal.sub, 'user_1');
  assert.equal(result.identity.clientId, 'trusted_oauth_client');
  assert.notEqual(result.identity.clientId, result.identity.principal.sub);
});

test('identity provider failures are sanitized', async () => {
  const gate = create(async () => { throw new Error('private token and JWKS details'); });
  const result = await gate.authorize('Bearer fake');
  assert.equal(result.status, 401);
  assert.equal(JSON.stringify(result).includes('JWKS'), false);
  assert.equal(JSON.stringify(result).includes('private token'), false);
});
