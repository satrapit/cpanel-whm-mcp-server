# Hosting and deployment

## Supported deployment target

The initial hosting target is a cPanel/CloudLinux Node.js Selector application using Phusion Passenger. Verified diagnostics on a reference server have demonstrated Node.js 22/24 startup via a CommonJS `app.js`, HTTPS GET/POST routing, temporary bearer-header forwarding, and MariaDB 10.11 connectivity with certificate-verified TLS. The live v3.9 probe also verified the full MCP SDK protocol roundtrip using a bounded test-only tool. These findings do **not** establish production readiness, OAuth compliance, or live cPanel/WHM operations.

### Packaging

- Build TypeScript to deployable JavaScript locally or in a trusted build environment; no production CLI access is required.
- Keep `app.js` as a minimal CommonJS Passenger bootstrap which unconditionally starts the listener, even if loaded with `require()`.
- Avoid loading optional third-party modules before the health listener is ready.
- Set the Application Root outside the public document root; configure the domain and startup file through Setup Node.js App.
- Use **Run NPM Install** in the Node.js App UI for runtime dependencies, or provide a reproducible tested bundle compatible with the server's Node.js version.
- Keep secrets in managed environment variables, not public files, source control or error responses.

### Database

The initial application database target is MySQL 8 or MariaDB 10.11+ as supported by the selected ORM. PostgreSQL is not available on the reference hosting environment.

- For remote database connections use a DNS hostname matching the TLS certificate and **verify the CA and hostname**.
- Enforce TLS verification in production; never bypass it to make the application connect.
- If the database is on the same physical machine, a Unix socket may be an alternative where the host permits access.
- Follow least-privilege account access, database backups and migration versioning.
- Use a distinct credential per environment and rotate credentials on exposure.

### MCP SDK

The SDK v2 package imports are `@modelcontextprotocol/server` and the Node HTTP adapter `@modelcontextprotocol/node`. Use `createMcpHandler` with `toNodeHandler`, and Zod v4 for tool input schemas.

Source: https://ts.sdk.modelcontextprotocol.io/v2/migration/support-2026-07-28

The temporary hosting probe is not a production integration. Its bearer token is **not** an OAuth implementation. Before exposing an operational MCP endpoint publicly, implement proper OAuth resource-server checks, precise scopes, per-tenant authorization and rate limits.

### Optional Redis / Valkey cache validation

CloudLinux PHP Selector's `redis` extension is a PHP client module, **not** evidence of a running Redis service. On compatible cPanel / LiteSpeed hosting, **LiteSpeed Redis Cache Manager** can create an isolated Redis (or Valkey) service for the cPanel account. This is distinct from LiteSpeed's HTTP page cache.

LiteSpeed documents per-account Unix sockets for CloudLinux and LiteSpeed Containers: `/tmp/redis.sock` when viewed from within the sandbox, with CloudLinux's underlying path usually under `$HOME/.cagefs/tmp/redis.sock`. Verify the actual socket visibility and permissions from the **Node.js Passenger process**, not just from PHP. The Node.js client does not require the PHP extension. Reference: https://docs.litespeedtech.com/lsws/cp/cpanel/whm-litespeed-plugin/wp-cache-management/#how-it-works

Probe v3.9 adds optional `POST /diagnostics/redis` under the temporary bearer and Host/Origin protections. It performs one read-only Redis/Valkey `PING` over a local Unix socket, defaulting to `/tmp/redis.sock`; set `REDIS_SOCKET_PATH` when needed. It uses only Node.js built-ins, never connects to arbitrary TCP hosts, and never writes, deletes or flushes cache keys. Socket-not-found or permission-denied does not imply Redis is absent on the server; the app's isolation context may differ.

**Live probe outcome (2026-11-22, v3.9, after enabling Redis Cache Manager):** Node.js 22.23.5 and Passenger passed HTTPS health, test bearer verification, MCP SDK readiness and end-to-end `initialize`, `tools/list`, `tools/call` (`MCP_SDK_END_TO_END_OK_V3_9`), MariaDB 10.11 authenticated `SELECT 1`, and upstream cPanel/WHM TLS verification on ports 2083/2087. Redis was initially unavailable at the expected Unix socket, and after enabling the account-scoped LiteSpeed Redis service, the same Node.js process returned `REDIS_PING_OK` over a Unix socket in 2 ms. This establishes local Redis transport reachability only; key operations, persistence, resource isolation under load, failover and production authorization remain unverified. Neither cPanel nor WHM API authorization was exercised. No production operational MCP tools are yet deployed.

**Redis is optional for the alpha MCP milestone.** Do not enable caching for authentication decisions or security-sensitive tokens without a reviewed design. The successful live Node.js `PING` confirms socket connectivity, but not complete production cache readiness. Redis or Valkey daemon status, persistence, security policy and production cache semantics require separate verification.

### MCP SDK version compatibility and diagnostic findings

The temporary cPanel probe uses Node.js v22, Passenger, a CommonJS `app.js` bootstrap, `@modelcontextprotocol/server@2.3.1` and `@modelcontextprotocol/node@2.1.1`. The actual cPanel installation reports that both SDK packages are installed with ESM entry files present, yet `import()` fails. This is still an unresolved runtime issue; do not claim a root cause.

An upstream report about a missing `dist/index.mjs` in server v2.4.0 ([issue #3166](https://github.com/modelcontextprotocol/typescript-sdk/issues/3166)) was **closed after the reporter identified a stale npx cache**. Do not treat that report as evidence of a confirmed publisher regression. Pinning older versions alone did not resolve our hosting failure.

Diagnostic probe v3.8 tests both the ESM `import()` and CommonJS `require()` export conditions, prefers a working ESM loader and falls back to CJS where available. Error diagnostics are redacted by category and include neither original error messages nor private filesystem paths. The full `initialize` / `tools/list` / `tools/call` sequence **passed** on probe v3.8 and again on v3.9 using CommonJS loading. ESM failure remains unresolved; future TypeScript build output must be validated against CommonJS runtime compatibility.

The public hosting hostname for the current diagnostic target is `mcp-test2.arsamnet.com`; set `PROBE_PUBLIC_HOST` explicitly for Host/Origin validation. Temporary bearer tokens are not OAuth.

### Security and operational validation

1. Confirm that Node.js starts under Passenger.
2. Confirm secure HTTPS and JSON POST routing.
3. Confirm SDK import/export readiness using the environment where dependencies were installed.
4. Confirm MCP `initialize`, `tools/list`, `tools/call` with bounded read-only tools.
5. Confirm database TLS cipher and authenticated read-only query.
6. Validate OAuth, authorization, cross-tenant negative cases, rate limits and secret redaction.
7. Confirm monitoring, backup, restart recovery and versioned upgrades.
8. Remove all temporary diagnostic routes and tokens before production.

### MariaDB TLS certificate renewal

If reusing a WHM-hosted certificate for MariaDB, WHM certificate renewal alone does not reload MariaDB. The administrator must maintain a validated, restricted certificate copy and an independently tested renewal synchronization process (certificate/key match, chain, hostname, atomic replacement, MariaDB `FLUSH SSL`, rollback, logging and alerts). Never require all legacy clients to use TLS before assessing compatibility.

## Initial release policy

Version `v0.1.0-alpha.1` is planned only. No production release or Git tag is warranted until the real SDK integration, full authentication and security checks have been executed successfully.

### Planned project build for Passenger (not a validated deployment)

This repository now includes a `tsconfig.passenger.json` target that compiles TypeScript to CommonJS under `dist-passenger/`, a build script that adds a nested CommonJS `package.json`, and a minimal `app.cjs` bootstrap for Passenger. It does not rely on top-level await or `import.meta` in its executable entry. Keep the root `package.json` in ESM mode for local development. These steps must **not** be confused with the already confirmed diagnostic probe: `pnpm build:passenger`, runtime dependency loading, OAuth metadata, Host/Origin behavior behind the reverse proxy and authenticated tool execution all need testing on the selected cPanel Passenger installation before any deployment claim. The cPanel UI must be confirmed to accept `app.cjs` as a startup filename; otherwise provide a separate CommonJS package-root deployment artifact.
