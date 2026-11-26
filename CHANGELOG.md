# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added — tenant read-model foundation
- Introduce MariaDB 10.11-compatible tenant, membership, connection, capability and grant schema with default-disabled access; migration is not applied on any host.
- Add parameterized, tenant-scoped, read-only connection repository port and five offline security tests. Preserve deny-all runtime wiring and external-KMS vault prerequisite.

### Local verification
- Add a dependency-free, loopback-only visual diagnostic with live HTTP health/version checks and a bounded synthetic JSON-RPC walkthrough on `/preview/rpc`.
- Reject all real `/mcp` requests in preview mode, disable provider credentials, and enforce local Host/Origin, CSP and payload limits.
- Add seven HTTP integration/security regression tests and `npm run preview:local` for a first visible local milestone without package registry connectivity.

### Security
- Add bounded per-process global pre-auth concurrency and per-tenant user rate/concurrency admissions; return HTTP 429 without exposing token identifiers. Distributed/edge controls remain pending.
- Scope connection lookups and credential vault requests explicitly to the authorized tenant and connection, while keeping all real connections disabled.
- Add negative tests for denied subjects and tenant-aware storage queries.

### Fixed
- Correct a `node:https` import that blocked the isolated CommonJS TypeScript build.

### Tests
- Add an actual dependency-free CommonJS compilation and `require()` runtime smoke test, alongside isolated limiter and authorization tests.

### Security
- Add isolated resource-server authorization policy with exact audience and expiry re-checks, bounded bearer headers and distinct 401/403 OAuth challenges.
- Validate signed tenant/user/client claims without string coercion; preserve the OAuth client identifier separately from the user subject.
- Guard duplicate Authorization headers and configure bounded Host/Origin allowlists for the trusted public proxy hostname.
- Bind allowlisted upstream endpoints to each provider type, reject oversized or malformed credentials before egress, and enforce a hard upstream deadline.
- Add an offline AES-256-GCM envelope encryption primitive with external key-wrapping interface and authenticated tenant/connection binding; no production credential repository is enabled.
- Extend the offline core test suite with cross-provider, tampering, cross-tenant, and unavailable key-wrapper regressions.

### Added
- Add an unverified isolated CommonJS Passenger build target and minimal `app.cjs` bootstrap; test-only packaging contracts are covered offline.
- Add dependency-light JWT claims, bearer policy and Passenger packaging regression tests.
- Initial working TypeScript project scaffold and read-only provider adapter examples (not yet fully verified or deployable).
- Initial repository engineering instructions and product scope.
- Initial development roadmap for a secure, read-only MCP foundation.
- Documented verified cPanel/Passenger and MariaDB TLS hosting requirements.
- Validated live test-only MCP SDK `initialize`, `tools/list`, and `tools/call` on Node.js 22 with CommonJS loader (probe v3.9).
- Validated account-scoped LiteSpeed Redis Unix-socket `PING` from Node.js (probe v3.9); production cache semantics remain untested.

## Planned: [0.1.0-alpha.1]
- Strict TypeScript project scaffolding and reproducible local development.
- MCP Streamable HTTP server and basic protocol tests.
- Typed cPanel UAPI and WHM API 1 clients, initially with mocked fixtures.
- Authorization scaffolding, server capability registry, input validation and audit foundation.
- Security, integration and contract testing baseline.

No version tag has been created by this document.
