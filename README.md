# cPanel & WHM MCP Server

Secure, open-source MCP server for managing cPanel hosting accounts and WHM servers through ChatGPT and AI assistants. Supports end users, resellers, and administrators.

**Repository:** https://github.com/satrapit/cpanel-whm-mcp-server

## Project status
The repository is in initial architecture/bootstrap stage. **No production-ready API tools are available yet.** The first planned milestone is `v0.1.0-alpha.1`; it will be tagged only after implementation and tests pass.

## Scope
- cPanel account-level functionality using documented UAPI.
- WHM reseller- and administrator-level functionality using documented WHM API 1.
- Multiple authorized connections, server-side access enforcement, typed MCP tools, capability discovery, safe change approval and auditable operations.
- Incremental expansion toward documented API coverage, with each capability's availability and limitations recorded.

## Security model
- OAuth/OIDC for user identity; cPanel/WHM API tokens are stored only on the service side.
- Strict tenant and server authorization, deny by default and no shell or arbitrary raw API execution.
- Read-only-first implementation; dangerous operations require explicit server-validated approval.
- No real server credentials, secrets or test accounts belong in this repository.

See [AGENTS.md](AGENTS.md) for engineering rules and source references.

## Getting started
Development scaffolding and local setup instructions will be added as part of the first tested implementation milestone.

## Versioning
Semantic Versioning and [CHANGELOG.md](CHANGELOG.md) are used from the first development version. The roadmap starts with `v0.1.0-alpha.1` and progresses to broader functionality only after security and test gates are satisfied.

## License
A public license must be selected and added before distributing a release. Apache-2.0 is the current proposal; do not assume a license is granted until a LICENSE file is committed.
