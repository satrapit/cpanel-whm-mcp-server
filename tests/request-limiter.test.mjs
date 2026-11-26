import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RequestLimiter } from '../dist-core/security/request-limiter.js';

const a = { tenantId: 'org1', sub: 'alice' };

test('limits requests and resets after the configured window', () => {
  let now = 1000;
  const limiter = new RequestLimiter({ windowMs: 60000, maxRequests: 2, maxInflight: 2, maxPrincipals: 4, clock: () => now });
  const first = limiter.tryAcquire(a);
  const second = limiter.tryAcquire(a);
  assert.equal(first.accepted, true);
  assert.equal(second.accepted, true);
  assert.equal(limiter.tryAcquire(a).accepted, false);
  first.release();
  second.release();
  assert.equal(limiter.tryAcquire(a).retryAfterSeconds, 60);
  now += 60000;
  const refreshed = limiter.tryAcquire(a);
  assert.equal(refreshed.accepted, true);
  refreshed.release();
});

test('concurrency limit denies excess requests and release is idempotent', () => {
  const limiter = new RequestLimiter({ windowMs: 60000, maxRequests: 10, maxInflight: 1, maxPrincipals: 2 });
  const first = limiter.tryAcquire(a);
  assert.equal(first.accepted, true);
  assert.equal(limiter.tryAcquire(a).retryAfterSeconds, 1);
  first.release();
  first.release();
  assert.equal(limiter.tryAcquire(a).accepted, true);
});

test('rate buckets are scoped to both tenant and user', () => {
  const limiter = new RequestLimiter({ windowMs: 60000, maxRequests: 1, maxInflight: 1, maxPrincipals: 4 });
  const one = limiter.tryAcquire(a);
  one.release();
  assert.equal(limiter.tryAcquire(a).accepted, false);
  assert.equal(limiter.tryAcquire({ ...a, tenantId: 'org2' }).accepted, true);
  assert.equal(limiter.tryAcquire({ ...a, sub: 'bob' }).accepted, true);
});

test('full map refuses new principals but can expire idle, never active principals', () => {
  let now = 100;
  const limiter = new RequestLimiter({ windowMs: 1000, maxRequests: 2, maxInflight: 2, maxPrincipals: 1, clock: () => now });
  const first = limiter.tryAcquire(a);
  assert.equal(first.accepted, true);
  now += 1001;
  const bob = { tenantId: 'org1', sub: 'bob' };
  assert.equal(limiter.tryAcquire(bob).accepted, false, 'active bucket must never be evicted');
  first.release();
  const next = limiter.tryAcquire(bob);
  assert.equal(next.accepted, true);
  next.release();
});

test('invalid principals, non-finite clocks and configuration fail closed', () => {
  assert.throws(() => new RequestLimiter({ windowMs: 0, maxRequests: 2, maxInflight: 2, maxPrincipals: 2 }));
  const limiter = new RequestLimiter({ windowMs: 1000, maxRequests: 1, maxInflight: 1, maxPrincipals: 2, clock: () => NaN });
  assert.equal(limiter.tryAcquire(a).accepted, false);
  assert.equal(limiter.tryAcquire({ tenantId: '', sub: 'alice' }).accepted, false);
});
