# PhreshOS System

The authoritative runtime and the web desktop that represents it.

PhreshOS is an open-source, server-authoritative operating system for running
and managing web-based programs in a unified web desktop environment, with
native agent access through shared APIs.

It is self-hosted and single-user. One owner runs it on a machine they control,
and the System keeps its authoritative state there.

## System

The System owns Program and Process lifecycle, routing, authentication,
persistence, and the boundaries through which code reaches host resources. The
web desktop turns that truth into a direct graphical interface.

```text
Host operating system
└── PhreshOS System
    ├── Server runtime
    │   └── Programs → Processes → Server and Client Endpoints
    └── Web desktop
        └── Windows, taskbar, dialogs, and Client representations
```

The browser is the machine's display, not its authority. The Server owns the
truth about Programs, Processes, authentication, persistence, and access to
host resources. A desktop connection represents that truth and provides the
local environment needed to interact with it.

## Runtime

A Program is the stable software identity known by the System. A Process is one
live execution aggregate of a Program and owns permanent Server and Client
handles.

A Server Endpoint executes host-side JavaScript. A Client Endpoint executes in
a sandboxed iframe inside the desktop and owns one Window. Both are Endpoints in
the same domain model.

Endpoints communicate explicitly. Starting an Endpoint does not push
application data or System state into it.

## Gateway

External Node tools and the CLI reach the running System through an owner-local
gateway: a Unix-domain socket with owner-only permissions on POSIX systems or an
owner-created named pipe on Windows. It opens no network port.

The gateway is a connection mechanism, not a separate public model. Consumers
use ordinary System handles and add only `disconnect()` when they own the
connection.

## Installation

The current System requires Node.js `24.15.0` or newer on macOS, Linux, or
Windows.

Install the CLI with a package manager:

| Package manager | Command |
| --- | --- |
| npm | `npm install --global @phreshos/cli` |
| pnpm | `pnpm add --global @phreshos/cli` |
| Bun | `bun add --global @phreshos/cli` |
| Yarn Classic | `yarn global add @phreshos/cli` |

Then install and control the System:

```sh
phresh system install
phresh system status
phresh system start
phresh system stop
phresh system enable
phresh system disable
```

The CLI verifies the official release archive, installs its production
dependencies, selects the release, and configures a native per-user service.

## Storage

Production state lives beneath `~/.phreshos` by default. Set
`PHRESHOS_HOME` to an absolute path to operate another System home.

Persistent state includes owner credentials, the System database, installed
Program files, Program resources, public uploads, logs, and the local gateway
address while the System is running.

## Development

Install the pinned dependencies and run the repository verification:

```sh
bun install --frozen-lockfile
bun run verify
```

Start the development System:

```sh
bun run dev
```

Build or package the production release:

```sh
bun run build
bun run pack
```

`build` produces the Server and desktop in `dist/`. `pack` creates the
versioned release archive and its SHA-256 checksum. `verify` checks the source
contracts and validates the packed System from a clean installation.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the repository workflow and
[SECURITY.md](SECURITY.md) for private vulnerability reporting.

## Repository boundary

This repository owns the authoritative runtime and its web desktop. Other
PhreshOS components enter through their published releases rather than sibling
source paths or assumptions about an enclosing workspace.

## License

Licensed under the [MIT License](LICENSE). Copyright © 2026 Zohayr SLILEH.
