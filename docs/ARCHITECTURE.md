# Foundation Architecture and Security Boundaries

Status: development bootstrap, reviewed on 2026-11-20. This diagram describes the intended module wiring, **not** a production-complete service.

```text
ChatGPT / MCP client
    | OAuth access token (audience = exact MCP resource URL)
    v
Fastify (loopback Host + Origin validation, bounded JSON body)
    | OIDC signature, issuer, audience, expiry and scope verification
    v
MCP SDK v2 createMcpHandler (fresh server per request)
    | selected connection UUID (untrusted) + authenticated principal
    v
Authorization: tenant + membership + per-connection grant
    | verified capability permission only
    v
Typed adapter (cPanel or WHM) --> server-side CredentialVault (not wired)
    | allowlisted GET, TLS hostname verification, pinned public IPv4
    v
Authorized cPanel :2083 / WHM :2087
    | parsed, bounded, allowlisted output
    v
MCP structured text result
```

## Implemented trust boundaries

1. The MCP client selects a **connection identifier**, never credentials or arbitrary API names. Effective permission depends on server-side membership, connection ownership/delegation, exact API family and verified server capability, not a client-supplied role.
2. An externally issued JWT establishes the subject, tenant claim, expiry, audience and read scope. JWT claims alone do not authorize an upstream connection.
3. The typed upstream transport forbids redirects, custom ports, HTTP, IP literals, private/reserved IPv4, IPv6, dynamic API endpoints and unsafe response content. A selected validated A record is pinned for TLS establishment; hostname-based certificate verification remains enabled.
4. Adapter normalization removes all non-selected fields before returning data. Remote content is not an instruction source and may never override server policy.

## Important architectural decision

In this initial milestone, persistence and credential vault are **not** implemented. The `DenyAllRepository` and vault stub are intentionally incapable of operating real connections. There is no development-authentication bypass. Although the provider client code exists, a production call path is deliberately disabled until an authenticated onboarding and encrypted secret store are reviewed and tested.

No database tables or migrations were created, as no persistent domain state is in use. PostgreSQL/Prisma and envelope encryption are pending real requirements for the first usable connection service. Do not store provider API tokens in PostgreSQL plaintext, environment templates or logs. Owner isolation must be enforced in persistence as well as services.

## Threat model / residual risks

| Threat | Current control | Incomplete work |
|---|---|---|
| Credential disclosure | No real credentials provisioned; output allowlisting | KMS/envelope encryption, rotation, audit |
| Horizontal/vertical escalation | Connection and membership checks, default deny | Durable grants, reseller ACL/version probes |
| SSRF / DNS rebinding | Public IPv4-only resolution, pinned A record, HTTPS/TLS, fixed ports and paths | Explicit private-network allowlist model and DNS integration tests |
| OAuth confusion / replay | External issuer, JWT validation, exact audience and expiry | Identity-provider interoperability and registration; API-level abuse controls |
| Malicious upstream response | Bounded output, selected fields, error normalization | Full provider schema variants, fuzz tests |
| Denial of service | 256 KiB upstream response cap, 8 s timeout, MCP input cap | Per-user rate limiting, per-connection concurrency cap |
| Unapproved changes | No write tools exist | Server-attested approval workflow before enabling mutations |

## Release boundary

`v0.1.0-alpha.1` is not tagged. Full pnpm installation, TypeScript typecheck, lint, Vitest/MCP handshake, OAuth flow, upstream transport integration and dependency audit are currently unverified. See [README](../README.md) for actual state.
