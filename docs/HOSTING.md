# Hosting and deployment

## Supported deployment target

The initial hosting target is a cPanel/CloudLinux Node.js Selector application using Phusion Passenger. Verified diagnostics on a reference server have demonstrated Node.js 22/24 startup via a CommonJS `app.js`, HTTPS GET/POST routing, temporary bearer-header forwarding, and MariaDB 10.11 connectivity with certificate-verified TLS. These findings do **not** establish production readiness or successful MCP SDK operation.

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

### MCP SDK version compatibility and diagnostic findings

The temporary cPanel probe uses Node.js v22, Passenger, a CommonJS `app.js` bootstrap, `@modelcontextprotocol/server@2.3.1` and `@modelcontextprotocol/node@2.1.1`. The actual cPanel installation reports that both SDK packages are installed with ESM entry files present, yet `import()` fails. This is still an unresolved runtime issue; do not claim a root cause.

An upstream report about a missing `dist/index.mjs` in server v2.4.0 ([issue #3166](https://github.com/modelcontextprotocol/typescript-sdk/issues/3166)) was **closed after the reporter identified a stale npx cache**. Do not treat that report as evidence of a confirmed publisher regression. Pinning older versions alone did not resolve our hosting failure.

Diagnostic probe v3.8 tests both the ESM `import()` and CommonJS `require()` export conditions, prefers a working ESM loader and falls back to CJS where available. Error diagnostics are redacted by category and include neither original error messages nor private filesystem paths. The full `initialize` / `tools/list` / `tools/call` sequence remains **unverified** until a successful real hosting test.

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
