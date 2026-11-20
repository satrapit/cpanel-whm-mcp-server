# Security Policy

**Status:** no supported production releases yet. Please avoid installing this development foundation on an internet-facing host or connecting production cPanel/WHM credentials. It lacks a persistent, encrypted credential vault and operational rate/concurrency controls.

## Vulnerability reports

Use [GitHub's private vulnerability reporting / security advisories](https://github.com/satrapit/cpanel-whm-mcp-server/security/advisories) when enabled. Do not disclose exploit details or tokens in public issues. If private reporting is unavailable, request a private contact channel through a minimal public issue without the vulnerability details.

## Security boundaries

The MCP OAuth bearer is distinct from cPanel and WHM API tokens. JWT issuer, audience, signature, expiry, scopes and tenant claim are verified; tenant membership and connection grants remain a separate mandatory server-side check. Outbound HTTPS targets must use reviewed operation paths and DNS resolution pinned to public IPv4 addresses, strict TLS and bounded response sizes. No upstream redirects are followed. Sensitive remote response fields are not passed through to MCP.

## Known gaps

- No durable tenant persistence, encrypted vault, per-tenant quotas, credential rotation, mutable approvals or live capability verification yet.
- IPv6 and private-host upstream connections are deliberately unsupported pending an explicit network policy.
- OIDC client-registration interoperability, OAuth metadata and gateway behavior are not end-to-end tested.
- The current code has not been security-audited or tested on a real cPanel/WHM instance.

**Do not promote this version to production.**
