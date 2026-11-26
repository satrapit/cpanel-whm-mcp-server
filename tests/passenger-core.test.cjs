const { test } = require('node:test');
const assert = require('node:assert/strict');

// This is a real, TypeScript-emitted CommonJS load test for all dependency-free core modules.
test('passenger core output is loadable using Node CommonJS require()', () => {
  const network = require('../dist-passenger-core/security/network.js');
  const upstream = require('../dist-passenger-core/security/upstream.js');
  const connections = require('../dist-passenger-core/connections/connection.js');
  const envelope = require('../dist-passenger-core/security/credential-envelope.js');
  const resource = require('../dist-passenger-core/auth/resource-policy.js');
  const limiter = require('../dist-passenger-core/security/request-limiter.js');
  assert.equal(typeof network.resolvePublicEndpoint, 'function');
  assert.equal(typeof upstream.readUpstreamJson, 'function');
  assert.equal(typeof connections.authorizeConnection, 'function');
  const mysqlRepo = require('../dist-passenger-core/connections/mysql-read-repository.js');
  assert.equal(typeof mysqlRepo.MySqlReadConnectionRepository, 'function');
  assert.equal(typeof envelope.encryptCredential, 'function');
  assert.equal(typeof resource.createResourceAuthorization, 'function');
  assert.equal(typeof limiter.RequestLimiter, 'function');
});
