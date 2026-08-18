# Contributing

The system repository owns the authoritative PhreshOS runtime: server state,
the desktop that represents it, local Program intake, persistence boundaries,
and Process management.

## Development

Install the pinned toolchain and verify the repository:

```sh
bun install --frozen-lockfile
bun run verify
```

`verify` type-checks the source and exercises the actual release archive from a
temporary installation; CI also boots it and requests the desktop. Changes to
production dependencies, assets, startup, or build layout must preserve that
standalone path.

Consume other PhreshOS components only through published releases. Do not add
workspace ranges, sibling paths, source aliases into another checkout, Git
submodules, or assumptions about an enclosing directory.

Runtime state must remain outside version control. Tests and development runs
must use isolated storage and clean up every process and temporary resource they
create.

## Pull requests

Explain which system-owned behavior the change serves, include focused proof
for new behavior, update public documentation when the contract changes, and
keep each pull request focused on one coherent change.
