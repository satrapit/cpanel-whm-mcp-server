# API Coverage Inventory

The initial review covers two vendor-documented **read** functions only. This is a seed inventory, not a complete scan of either OpenAPI schema. The source of truth is the [official cPanel/WHM API portal](https://api.docs.cpanel.net/), which currently documents v138. Read-only adapter source and synthetic tests are present, but **neither provider call is live-enabled nor real-server tested**.

Machine-readable inventory: [`api-coverage.json`](api-coverage.json). The `documented`, `adapter_present`, `published_mcp`, `enabled_for_user`, `synthetic_contract_tested`, and `real_server_tested` statuses are distinct.

| Capability | Function | Adapter | MCP tool | Live enabled | Verified live |
|---|---|---|---|---|---|
| cPanel domains | `DomainInfo::list_domains` | Source present | `cpanel_list_domains` | No | No |
| WHM accounts | `listaccts` | Source present | `whm_list_accounts` | No | No |

Most cPanel and WHM APIs have not yet been inventoried. Deprecations, minimum server versions, precise reseller ACL prerequisites and server feature compatibility have not been verified. Fields not validated from official docs are recorded as `unknown`, not inferred. Future additions require official schema/provenance validation and negative security tests before MCP publication.

The repository intentionally does **not** expose an unrestricted API proxy, legacy API 1/2 tools, provider token management, write calls, administrative server actions or shell/SQL execution.
