import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertHostname, isPublicIPv4, resolvePublicEndpoint } from '../dist-core/security/network.js';
import { authorizeConnection, AuthorizationError } from '../dist-core/connections/connection.js';
import { parseDomainList } from '../dist-core/providers/cpanel.js';
import { parseWhmAccounts } from '../dist-core/providers/whm.js';
import { readUpstreamJson } from '../dist-core/security/upstream.js';

const principal = { sub: 'u1', tenantId: 't1', scopes: ['mcp:read'] };
const conn = { id: 'id', tenantId: 't1', kind: 'cpanel', hostname: 'example.com', username: 'someuser', enabled: true, credentialRef: 'opaque', verifiedCapabilities: ['cpanel.domains.list'] };
const repo = (connection = conn) => ({
  async get() { return connection; },
  async isMember() { return true; },
  async canAccess() { return true; },
});

test('known private, reserved, metadata and IPv6 addresses cannot be used for egress', () => {
  for (const host of ['127.0.0.1', '10.0.0.1', '192.168.1.1', '169.254.169.254', '100.100.100.200', '172.18.2.3', '0.0.0.0', '198.18.0.1', '192.0.2.22', '203.0.113.20', '::1']) {
    assert.equal(isPublicIPv4(host), false, host);
  }
  assert.equal(isPublicIPv4('8.8.8.8'), true);
});

test('hostname validation rejects injection, localhost and ip literals', () => {
  for (const name of ['localhost', '127.0.0.1', '[::1]', 'evil.com/path', 'evil.com:2083', 'EXAMPLE.COM', 'x..com', 'xn--.com']) {
    assert.throws(() => assertHostname(name), name);
  }
  assert.equal(assertHostname('cpanel.example.com'), 'cpanel.example.com');
});

test('DNS records are validated as a set, refusing rebind candidates', async () => {
  await assert.rejects(resolvePublicEndpoint('example.com', async () => ['8.8.8.8', '127.0.0.1']));
  assert.equal(await resolvePublicEndpoint('example.com', async () => ['8.8.4.4']), '8.8.4.4');
});

test('deny cross-tenant and unverified capabilities', async () => {
  await assert.rejects(authorizeConnection(repo(), { ...principal, tenantId: 't2' }, 'id', 'cpanel', 'cpanel.domains.list'), AuthorizationError);
  await assert.rejects(authorizeConnection(repo(), principal, 'id', 'whm', 'cpanel.domains.list'), AuthorizationError);
  await assert.rejects(authorizeConnection(repo({ ...conn, verifiedCapabilities: [] }), principal, 'id', 'cpanel', 'cpanel.domains.list'), AuthorizationError);
  await assert.rejects(authorizeConnection({ ...repo(), async canAccess() { return false; } }, principal, 'id', 'cpanel', 'cpanel.domains.list'), AuthorizationError);
  await assert.rejects(authorizeConnection({ ...repo(), async isMember() { return false; } }, principal, 'id', 'cpanel', 'cpanel.domains.list'), AuthorizationError);
  assert.equal((await authorizeConnection(repo(), principal, 'id', 'cpanel', 'cpanel.domains.list')).id, 'id');
});

test('cPanel UAPI envelope is strictly validated and response is bounded', () => {
  const raw = { module: 'DomainInfo', func: 'list_domains', result: { status: 1, data: { main_domain: 'example.com', addon_domains: ['a.com'], sub_domains: [], parked_domains: [] } } };
  assert.deepEqual(parseDomainList(raw), { domains: ['example.com','a.com'], truncated: false });
  assert.throws(() => parseDomainList({ ...raw, result: { ...raw.result, status: 0 } }));
  assert.throws(() => parseDomainList({ ...raw, result: { ...raw.result, data: { ...raw.result.data, addon_domains: {} } } }));
  assert.equal(parseDomainList({ ...raw, result: { ...raw.result, data: { ...raw.result.data, addon_domains: Array.from({ length: 60 }, (_, i) => `${i}.example.com`) } } }).truncated, true);
});

test('WHM API 1 response contract and output allowlisting', () => {
  const raw = { metadata: { command: 'listaccts', result: 1 }, data: { acct: [{user:'demo', domain:'example.com', pass:'MUST_NOT_RETURN'}] } };
  assert.deepEqual(parseWhmAccounts(raw).accounts, [{user:'demo', domain:'example.com'}]);
  assert.equal(JSON.stringify(parseWhmAccounts(raw)).includes('MUST_NOT_RETURN'), false);
  assert.throws(() => parseWhmAccounts({ ...raw, metadata: { command: 'listaccts', result: 0 } }));
});

test('upstream rejects arbitrary URLs and paths before network access', async () => {
  const connection = { kind: 'cpanel', hostname: 'example.com', username: 'demo', token: 'redacted' };
  for (const path of ['/evil', '//evil.com', '/execute/DomainInfo/list_domains/../../etc', 'https://evil.com/']) {
    await assert.rejects(readUpstreamJson(connection, path, async () => ['8.8.8.8']));
  }
});
