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

Requirements: Node.js 24+, pnpm 10 and a trusted OIDC identity provider issuing access tokens for the exact MCP resource URL, with a signed `tenant_id` claim and `mcp:read` scope. The server is loopback-only in this milestone.

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

## Security and API compatibility

- API docs: [cPanel UAPI](https://api.docs.cpanel.net/cpanel/introduction) and [WHM API 1](https://api.docs.cpanel.net/whm/introduction).
- MCP SDK: [official TypeScript server SDK](https://github.com/modelcontextprotocol/typescript-sdk).
- Secret values stay outside MCP outputs, logs and Git. The server accepts no arbitrary upstream URL/function/parameter or shell commands.
- No guarantee of real-server compatibility exists without an authorized, separately enabled integration suite.
- We do not claim endorsement by WebPros/cPanel or OpenAI.

Contributions and vulnerability reporting: [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md). The repository is currently unlicensed for redistribution until the owner selects and commits a license (Apache-2.0 is proposed).
