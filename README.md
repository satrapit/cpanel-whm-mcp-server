# cPanel & WHM MCP Server

Secure, open-source MCP resource-server project for authorized cPanel UAPI and WHM API 1 access by ChatGPT and other MCP clients. End-user, reseller and administrator connection models are planned; permissions are verified per connection, not inferred from caller labels.

**Status: development foundation; not a released or production-ready server.** The working tree declares `0.1.0-alpha.1` as its *planned* prerelease version. **No release tag has been created.** The current integration exposes read-only tool descriptors but has no credential vault or persistent tenant repository; real upstream calls deliberately fail closed. The vendor adapters are only contract-tested against synthetic data.

## Implemented foundations

- Official MCP TypeScript SDK v2-based stateless Streamable HTTP integration design with typed, read-only tool registrations.
- Validated OIDC JWT signatures/issuer/audience/expiry/scopes via `jose`, using externally provisioned JWKS. No custom OAuth authorization server.
- Protected-resource metadata, health and version endpoints, and deny-by-default connection repository.
- Narrow cPanel `DomainInfo/list_domains` and WHM API 1 `listaccts` provider adapters.
- HTTPS-only management ports (`2083`, `2087`), fixed operation paths, verified TLS, pinned DNS resolution and public-IPv4-only outbound policy.
- Bounded and allowlisted provider output; no upstream response passthrough or unreviewed write API tools.

**Not implemented:** encrypted credential storage, database migrations, onboarding, dynamic server capability discovery, verified reseller ACLs, public remote deployment, write/approval flows, rate limiting, concurrency control, testable real-server access and automated CI. See [API coverage](docs/API_COVERAGE.md) and [architecture](docs/ARCHITECTURE.md).

## Development setup

Requirements: Node.js 22.16+ (current cPanel target is Node.js 22), pnpm 10 and a trusted OIDC identity provider issuing access tokens for the exact MCP resource URL, with a signed string `tenant_id` claim, a `client_id` (or `azp`) OAuth client identifier, and the `mcp:read` scope. The server is loopback-only in this milestone.

```sh
corepack enable
pnpm install
cp .env.example .env
# Configure OIDC_ISSUER and OIDC_JWKS_URL and load environment variables in your shell.
set -a; . ./.env; set +a
pnpm typecheck
pnpm test
pnpm lint
pnpm format:check
pnpm build
pnpm start
```

The committed dependency lockfile is **pending generation and verification in a network-enabled environment**. Until it is committed, `pnpm install` is not fully reproducible. Do not tag or distribute a release using this bootstrap alone. Package versions are pinned as a provisional baseline.

Available routes (on `http://127.0.0.1:3000` by default): `GET /health`, `GET /version`, `GET /.well-known/oauth-protected-resource/mcp`, and authenticated `POST /mcp`. The metadata points OAuth clients at an external issuer; the MCP server never issues access tokens itself.

To inspect the public health endpoint:

```sh
curl -fsS http://127.0.0.1:3000/health
```

`tools/list` requires a correctly issued bearer token with `aud` exactly equal to `PUBLIC_MCP_URL`; missing/invalid tokens return `401`. The tools are `capabilities_list`, `connections_list`, `cpanel_list_domains` and `whm_list_accounts`. Actual upstream tools return access denied until persistence and a secret vault are implemented.

## First visible local test (zero external dependencies)

The following local-only diagnostic gives you a real, interactive HTTP page before the
full MCP SDK / OAuth environment is ready. **It is not the production MCP server**:
its synthetic JSON-RPC roundtrip runs at `/preview/rpc`, and `/mcp` always rejects
requests. No hosting credential, network egress, login or database is enabled.

Requirements: Node.js 22 or 24. **No npm/pnpm installation is needed** for this preview.

```sh
# From the checked-out repository
node --version
npm run preview:local
# Open in your browser: http://127.0.0.1:3100/
```

On macOS, open the URL in Safari/Chrome, or use `open http://127.0.0.1:3100/`.
The dashboard lets you inspect HTTP health/version; press **Initialize**,
**List tools**, **Call preview_status**, and **Test GET /mcp → 401**.
Each action performs a real local HTTP request; the JSON-RPC responses are
*synthetic diagnostics*, not evidence that the official MCP SDK is running.

In a second terminal, run the automated end-to-end HTTP checks:

```sh
node --test tests/local-preview.test.mjs
curl -i http://127.0.0.1:3100/health
curl -i http://127.0.0.1:3100/mcp
```

Expected: `/health` responds `200`, `/mcp` responds `401` without OAuth, and
seven local-preview regression tests pass. Use `Ctrl+C` to stop the server.
The preview binds **only** to `127.0.0.1`, rejects unexpected Host/Origin,
and refuses production mode. It deliberately does not read `.env` or contact
real hosting servers.

**Next gate:** install verified SDK dependencies with pnpm, generate and commit
the lockfile, run full TypeScript/lint/build, then replace the synthetic
walkthrough with actual SDK-backed MCP protocol and OIDC integration tests.

## Security and API compatibility

- API docs: [cPanel UAPI](https://api.docs.cpanel.net/cpanel/introduction) and [WHM API 1](https://api.docs.cpanel.net/whm/introduction).
- MCP SDK: [official TypeScript server SDK](https://github.com/modelcontextprotocol/typescript-sdk).
- Secret values stay outside MCP outputs, logs and Git. The server accepts no arbitrary upstream URL/function/parameter or shell commands.
- No guarantee of real-server compatibility exists without an authorized, separately enabled integration suite.
- We do not claim endorsement by WebPros/cPanel or OpenAI.

Contributions and vulnerability reporting: [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md). The repository is currently unlicensed for redistribution until the owner selects and commits a license (Apache-2.0 is proposed).

## Deployment target caveat

The current TypeScript/ESM bootstrap is a development-only scaffold and is **not yet the verified CommonJS Passenger deployment artifact**. The cPanel runtime probe documented in `docs/HOSTING.md` confirms only a test-only MCP/Redis roundtrip, not this application. Before deployment, build and verify the Passenger-compatible CommonJS entry in the actual target environment.

Core isolated security tests: `pnpm test:core` (requires locally installed TypeScript); complete MCP/OAuth integration and release verification are pending.

## Offline security verification and Passenger build (not release-ready)

`pnpm test:core` runs the dependency-light Node test suite for SSRF, authorization decisions, JWT claim validation, tenant isolation, credential-envelope tampering and Passenger packaging. `pnpm typecheck:core` checks only those isolated TypeScript modules. The full SDK/HTTP/OAuth flow has **not** been tested by these commands; it requires a networked, dependency-installed environment.

The hosting target supports a **separate CommonJS build path**, because the live cPanel diagnostic could load the SDK through CommonJS while ESM loading remained unresolved:

```sh
pnpm install
pnpm build:passenger
pnpm start:passenger
```

Configure cPanel Passenger's startup file as `app.cjs` **only after validating your Node.js Selector accepts that filename**, and keep the application root outside public_html. The build generates `dist-passenger/` with its own `{ "type": "commonjs" }` and uses Node 22; it is **not yet verified** on the actual cPanel target. Do not use the temporary diagnostic bearer mechanism as production OAuth. See [hosting evidence and limitations](docs/HOSTING.md).

The public MCP endpoint now distinguishes `401 invalid_token` from `403 insufficient_scope`, checks the exact resource and expiry again at the HTTP boundary, and carries the signed end-user `sub` separately from OAuth `clientId`. Provider access remains disabled by the deny-all repository.

### Per-process request limits and offline CommonJS verification

The `/mcp` boundary now enforces bounded in-process global admission before
token verification (64 concurrent requests; 2,000 requests per 60-second window).
After signature verification and signed tenant/user validation, a second limiter
allows 60 requests per minute and 4 concurrent requests per subject per tenant.
Exceeded limits return HTTP 429 and `Retry-After`. **These are not distributed
quotas**; production deployments must also apply reverse-proxy/edge throttling,
particularly for invalid-token traffic.

Connection lookup now accepts `tenantId` plus `connectionId`. Credential-vault
calls include the authorized tenant/connection scope; a real vault and persistent
tenant-scoped database are **not yet implemented**.

Two offline checks are available with Node.js 22, TypeScript and Node types:

```sh
pnpm test:core
pnpm test:passenger-core
pnpm typecheck:core
```

`test:passenger-core` compiles only dependency-free core modules into real
CommonJS JavaScript and loads them with `require()`. It does **not** validate
the MCP SDK, Fastify, Jose, full Passenger app, or production OAuth integration.
