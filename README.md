# PhreshOS System

The authoritative PhreshOS runtime and the web desktop that represents it.

PhreshOS runs as a per-user service on Windows, Linux, and macOS. The server
owns the system's truth: Programs, Processes, authentication, persistence, and
the boundaries through which code reaches the machine. The desktop presents
that truth in the browser; it does not become a second source of system state.

PhreshOS is single-user and self-hosted. Its runtime state remains on the
machine that runs it, and the System adds no telemetry.

## Mental model

```text
Host operating system
└── PhreshOS System
    ├── Server runtime
    │   ├── Programs → Processes → Endpoints
    │   ├── Authentication and persistence
    │   └── Local Program intake
    └── Web desktop
        └── Browser representation of server truth
```

A Program is the stable unit installed or attached to the System. A Process is
one running incarnation of that Program. Its Endpoints are the places where its
code participates in the system:

- A Server Endpoint runs Node.js code on the host.
- A Client Endpoint runs in a sandboxed iframe on the desktop and owns its
  Window.
- Every Endpoint communicates through explicit Traffic.

Endpoints are silent by default. Data, events, permissions, and host state do
not enter an Endpoint merely because it exists; Program code must explicitly
request or subscribe to what it needs.

## System boundaries

The server owns authoritative state and Process lifecycle. The desktop owns its
representation: windows, focus, layering, taskbar, and interaction. Programs
remain isolated from one another and reach shared system capabilities only
through the contracts exposed to their Endpoints.

Local Program operations enter through an owner-restricted intake address. On
POSIX systems this is a Unix domain socket with mode `0600`; on Windows it is an
owner-created named pipe. It opens no network port and requires no token beyond
the operating-system account that owns it.

`phresh dev` and `phresh start` run an attached Program whose lifetime follows
the intake connection. `phresh install` creates the persistent installed form,
and `phresh uninstall` removes it through the same local boundary.

## Install and operate

On Linux and macOS:

```sh
curl -fsSL https://install.phreshos.com/sh | bash
```

On Windows PowerShell:

```powershell
irm https://install.phreshos.com/ps1 | iex
```

The bootstrap installs the official `phresh` CLI, which acquires a compatible
System release and registers the native per-user service. The CLI remains the
owner of installation and service lifecycle:

```sh
phresh system status
phresh system start
phresh system stop
phresh system uninstall
```

System releases are verified production archives published through the
official [`PhreshOS/system`](https://github.com/PhreshOS/system) GitHub
Releases. They are not npm packages or source checkouts. Production runs on
Node.js and does not require Bun, TypeScript, or Vite.

The `0.x` release line is pre-stable. Public runtime contracts may change before
the first stable release.

## Persistence

Production keeps System state beneath the owner's `~/.phreshos` directory.
This includes credentials and private material, the System database, installed
Programs and their storage, uploaded files, and the local intake address while
the service is running.

Development uses the repository's `storage/` directory by default.
`PHRESHOS_HOME` may name another absolute directory for an isolated development
instance; production does not consume this development override.

`PHRESHOS_PORT` optionally selects the public desktop port. Production defaults
to `4300`. Neither environment variable is required.

Runtime state must never enter the repository or a release archive.

## Develop the System

Install the pinned development dependencies and run the complete verification:

```sh
bun install --frozen-lockfile
bun run verify
```

Start an isolated development instance:

```sh
bun run dev
```

The repository's release operations are:

```sh
bun run build
bun run pack
bun run verify
```

`build` produces the Node.js server and static desktop under `dist/`. `pack`
creates `phreshos@<version>.zip` and its SHA-256 checksum. `verify` type-checks
the source, exercises the runtime contracts, creates and extracts the actual
distribution archive, installs only its declared production dependencies, and
validates its Node.js entrypoint. CI additionally boots the clean installation
and requests the desktop.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the repository workflow and
[SECURITY.md](SECURITY.md) for private vulnerability reporting.

## Repository boundary

This repository owns the System runtime and its desktop representation. Shared
domain contracts come from the published `@phreshos/core` package, and shared
visual primitives come from published `@phreshos/react-ui` releases.

The CLI owns acquisition, installation, updates, and operating-system service
integration. SDK repositories own Program-facing contracts. This repository
does not import sibling source or depend on the enclosing local workspace.

## License

Licensed under the [MIT License](LICENSE). Copyright © 2026 Zohayr SLILEH.
