# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]
### Added
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
