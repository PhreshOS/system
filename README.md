# PhreshOS

The authoritative PhreshOS runtime: its server, browser desktop, local Program
intake, persistence boundaries, and Process management.

## Distribution

PhreshOS is distributed as a built archive from the official
[`PhreshOS/system`](https://github.com/PhreshOS/system) GitHub Releases. It is
not an npm package. The `phresh` CLI owns installation and service lifecycle:

```sh
phresh system install
phresh system status
```

The bootstrap installs the CLI; `phresh system install` selects and verifies a
compatible system release, installs its production dependencies, and registers
the service. A production installation needs Node.js, but it never needs Bun,
TypeScript, Vite, or this source checkout.

The `0.x` line remains under active testing. The lifecycle commands and public
release channel are being prepared and are not yet the way this transitional
workspace starts the system.

## Development

Install the pinned toolchain and verify the complete repository:

```sh
bun install --frozen-lockfile
bun run verify
```

Run a development instance with:

```sh
bun run dev
```

Development stores its isolated state in `storage/`, unless `PHRESHOS_HOME`
names another absolute directory. Production always uses the real per-user
`~/.phreshos` directory and does not consume that development override. The
public port defaults to `4300`; `PHRESHOS_PORT` accepts any integer from 1
through 65535.

Neither variable is required. Runtime storage—including credentials, private
keys, databases, logs, installed Programs, and uploaded files—must never enter
the repository.

## Build and release artifact

```sh
bun run build
bun run pack
```

`build` produces a Node.js server and static desktop under `dist/`. `pack`
places that build and its non-bundled assets in `phreshos@<version>.zip`. The
adjacent `.sha256` file lets the CLI verify the integrity of the downloaded
archive. The archive contains no TypeScript source, development tooling,
repository state, or runtime storage.

`bun run verify` type-checks the source, creates the exact distribution archive,
extracts it into a temporary installation, installs only its declared production
dependencies, and validates its Node.js entrypoint. On the clean CI runner it
also boots that installation and requests the desktop. This is the release
boundary: a successful source build alone is insufficient.

## Repository boundary

This repository owns the real system state and the desktop representation of
that state. Shared vocabulary comes only from published `@phreshos/core`; shared
Program-facing materials come only from published `@phreshos/react-ui`. It does
not import sibling repository source or depend on an enclosing workspace.

The CLI owns acquisition, installation, updates, and operating-system service
integration. SDK repositories own Program-facing contracts. Those concerns do
not move into the system merely because they integrate with it.

## License

Licensed under the [MIT License](LICENSE). Copyright 2026 Zohayr SLILEH.
