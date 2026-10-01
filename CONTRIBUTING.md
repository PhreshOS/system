# Contributing

This repository is the PhreshOS System: the service that runs Programs, their
Processes and Endpoints, authentication, permissions, storage, and the Desktop
that shows them.

## Setup

You need [Bun](https://bun.sh) 1.3 and Node.js 24.15 or newer.

```sh
bun install --frozen-lockfile
bun run dev
```

`dev` keeps its data in `storage/`, which is never committed, and serves the
Desktop on the first free port from `5300`.

## Before a pull request

```sh
bun run verify
```

`verify` type-checks the source, builds it, and runs the tests. One test packs
the release, installs it in a temporary folder the way a user's System is
installed, and boots it. A change to production dependencies, assets, startup,
or the build layout must keep that path working. CI runs `verify` on Linux and
Windows.

## Rules

- Use other PhreshOS packages only through their published releases. Do not
  add workspace ranges, paths to sibling folders, source aliases into another
  checkout, Git submodules, or assumptions about an enclosing folder.
- Keep runtime state out of version control. Tests and development runs use
  their own storage, and clean up every process and temporary file they
  create.
- Tests and their fixtures go in `tests/`; tooling goes in `scripts/`.

## Pull requests

Keep each pull request to one change. Explain what it changes in the System
and why, add tests for new behavior, and update the
[documentation](https://github.com/PhreshOS/website) when a public behavior
changes.
