# Changelog

Notable changes are tracked following [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial engineering policies, requirements and version roadmap.
- Bootstrap TypeScript sources for a stateless Streamable HTTP MCP resource-server using the official v2 SDK.
- OIDC JWT verification and deny-by-default tenant/connection permission port.
- Hardened HTTPS upstream transport and allowlisted read-only cPanel/WHM adapters.
- Two machine-readable capability descriptors and synthetic contract/security tests.
- Local setup, threat model and security documentation.

### Pending before `v0.1.0-alpha.1`
- Generate and commit a verified pnpm lockfile, install dependencies, and execute full build/lint/typecheck/tests.
- Verify MCP OAuth integration, tool discovery and transport in an executable environment.
- Implement encrypted secret storage and persistent ownership/ACL checks before any live upstream connection.
- Review and address remaining security risks, then tag an approved release.

**This working state is not a release.**
