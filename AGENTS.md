# Engineering Instructions — cPanel & WHM MCP Server

## Mission
Build and maintain a secure, open-source MCP server for authorized management of cPanel accounts and WHM reseller/administrator servers through AI clients. Repository: `satrapit/cpanel-whm-mcp-server`.

## Non-negotiable priorities
1. Security, least privilege, tenant isolation, safe operations and correct authorization.
2. Correctness, compatibility with documented APIs, resilient failure behavior.
3. Performance, resource efficiency, maintainability and developer experience.
4. Broad coverage through incremental, tested capability modules.

Never claim absolute security, complete API coverage, production readiness or successful tests without evidence.

## Technology baseline
- Node.js active LTS; TypeScript strict mode (no unreviewed `any`), pnpm and pinned lockfile. Design source modules with standard imports/exports; for the proven cPanel Passenger target, build and validate a CommonJS-compatible runtime entry until native ESM loading is repaired and verified.
- MCP TypeScript SDK v2 (`@modelcontextprotocol/server`) with Streamable HTTP; inspect current official examples and verify adapter versions before coding.
- Fastify, Zod, Pino, Prisma and MySQL/MariaDB for the current cPanel deployment target; PostgreSQL may be supported as an alternate database where available. Verify driver and migration compatibility.
- Prefer a modular monolith with independent MCP transport, application services, authentication/authorization, capability registry, providers, adapters and persistence.
- Security-sensitive code must have explicit threat models, tests and documented trust boundaries.

## Functional boundaries
- Three principal roles: cPanel end user, WHM reseller and WHM administrator/root.
- Users may connect multiple authorized servers. Never infer WHM privileges from a cPanel credential; verify effective server roles and ownership dynamically.
- cPanel UAPI is the primary account API; WHM API 1 is the server/reseller API. Consider documented `uapi_cpanel` for authorized WHM-to-cPanel calls.
- Legacy API 1/2 or undocumented UI endpoints are not default integrations. Document gaps; never bypass capabilities using arbitrary shell, URL, SQL, API proxy or credential impersonation.
- Maintain a versioned capability registry with API family, function, parameters, output schema, availability constraints, roles, minimum/maximum compatible versions, privileges, risk, source URL and coverage/test status.
- Full coverage is a roadmap, not a claim about the initial release. Implement small verified vertical slices.

## Security baseline
- The MCP server is an OAuth resource server; use an established OAuth/OIDC identity provider for authorization rather than building a home-grown authorization server. Validate issuer, audience/resource, expiration, scopes, PKCE and state according to supported MCP/OAuth standards. Publish required discovery and protected-resource metadata.
- Authenticate and authorize every MCP request and tool call on the server; do not trust the LLM's assertions about identity, ownership or permissions.
- Separate tenant/user/connection scoping with object-level authorization, default deny, least-privilege policy, negative tests and audit logs.
- Store cPanel/WHM tokens only in encrypted server-side secret storage (envelope encryption/KMS or carefully managed AES-256-GCM), never in MCP outputs, URLs, logs or Git.
- Verify TLS; prohibit insecure ports and redirects to untrusted targets. Prevent SSRF and DNS rebinding when connecting user-specified hosts; tightly control outbound egress and address resolution.
- Treat all data from remote servers, user-controlled files, domains, DNS and email as untrusted. No prompt injection may override authorization or security policy.
- Categorize operations as read, reversible-write, destructive, or highly privileged. Writes are off by default. Require server-verified, short-lived, action-specific user approval for destructive or high-risk actions; do not substitute an LLM-generated assertion for approval.
- No unrestricted raw API, shell execution, arbitrary URL fetching or SQL execution tools. Apply input/output validation, size limits, request timeouts, rate limits, quotas, retries only where safe, and idempotency keys where possible.
- Audit sensitive operations and approvals using redact-by-default structured logs and correlation IDs. Minimize retention and provide token rotation/revocation.

## Coding, documentation and quality
- Prefer dependency injection, small cohesive modules and typed interfaces. Comment WHY and security/compatibility assumptions, not obvious syntax. Document exported public interfaces with concise TSDoc.
- Maintain a small accurate doc set: README.md, AGENTS.md, SECURITY.md, CONTRIBUTING.md, CHANGELOG.md and docs/ARCHITECTURE.md + docs/API_COVERAGE.md where necessary. Avoid duplicative documents.
- Produce unit, integration, contract and security regression tests. Use recorded/synthetic fixtures with secrets removed; destructive integration tests require isolated disposable targets and explicit opt-in.
- Run format, lint, typecheck, tests and security checks before reporting a milestone as completed. Never invent test results.
- Avoid unnecessary abstractions or dependencies. All tool descriptions must be bounded, clear and not promise more than the implementation supports.

## Versioning and delivery
- Follow SemVer 2.0.0 and Keep a Changelog from the beginning.
- First planned release: `v0.1.0-alpha.1`; do not create a tag until a working, tested milestone exists.
- Every meaningful change updates the Unreleased changelog section; public interface/schema changes require compatibility notes and migration instructions.
- Pin dependencies, commit lockfiles, version database migrations, and explain rollback/upgrade procedures.
- Use conventional commit messages. Keep `main` deployable; use focused pull requests for substantial work and do not force-push main.
- No production deployment or access to real cPanel/WHM servers without explicit user authorization. Do not commit secrets.
- cPanel Passenger deployments must keep a minimal, reliable bootstrap. An MCP v3.9 probe verified CommonJS SDK loading, the protocol roundtrip and Redis socket PING on the deployment target; production cPanel/WHM operations remain unverified. See docs/HOSTING.md for verified constraints. Temporary bearer-token hosting probes must never be represented as production OAuth authorization.

## Source-of-truth references
- https://api.docs.cpanel.net/
- https://api.docs.cpanel.net/cpanel/introduction
- https://api.docs.cpanel.net/whm/introduction
- https://api.docs.cpanel.net/specifications/cpanel.openapi/
- https://api.docs.cpanel.net/specifications/whm.openapi/
- https://github.com/modelcontextprotocol/typescript-sdk
- https://modelcontextprotocol.io/specification/
- https://developers.openai.com/plugins/

When a documented behavior or API version is uncertain, verify the upstream source and record the exact source URL and verification date instead of guessing.

## Immediate kickoff
1. Inspect current repository files and Git history.
2. Establish package/workspace scaffolding, strict TypeScript and dependable quality scripts.
3. Build a secure read-only MCP endpoint with typed provider adapters and mocked cPanel/WHM contracts.
4. Implement authorization scaffolding, capability discovery, error normalization and tenant isolation with negative tests.
5. Document the first milestone and ship `v0.1.0-alpha.1` only when its acceptance checks pass.
