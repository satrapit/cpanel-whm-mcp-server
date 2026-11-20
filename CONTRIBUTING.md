# Contributing

Read [AGENTS.md](AGENTS.md) for security invariants and [README.md](README.md) for the current development setup. Open issues before adding significant capabilities. Keep contributions focused and use Conventional Commits, e.g. `fix: reject private DNS answers`.

For changes to cPanel/WHM behavior, include an official vendor URL, exact operation/parameters, server compatibility and privilege requirements, test fixtures, negative authorization cases, and a coverage-inventory update. Never add unreviewed raw API execution or destructive tools.

Before submitting, run `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, `pnpm audit` and `pnpm build`. Report commands that could not run rather than claiming success. Do not add production secrets, real customer data or unredacted upstream responses. No server deployment, tag or publish action is permitted without explicit release approval.
