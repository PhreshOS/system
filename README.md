# PhreshOS System

The authoritative runtime and web desktop for PhreshOS Programs.

[Documentation](https://docs.phreshos.com/system) ·
[Runtime model](https://docs.phreshos.com/runtime) ·
[Installation](https://docs.phreshos.com/installation) ·
[Source](https://github.com/PhreshOS/system)

## Role

The System owns Program and Process lifecycle, Endpoint execution, routing,
authentication, persistence, permissions, host capabilities, and the web
Desktop that represents this state.

The browser is a display, not the authority. Client, Server, Node, and CLI
consumers reach one shared domain model whose contracts are defined by Core.
See [What is PhreshOS?](https://docs.phreshos.com/what-is-phreshos) for the
complete product model.

## Installation

The current System requires Node.js 24.15.0 or newer. Install and operate it
through the CLI:

```sh
phresh system install
phresh system status
phresh system start
phresh system stop
phresh system enable
phresh system disable
```

Production state uses `~/.phreshos` by default. `PHRESHOS_HOME` selects another
System home. See [Installation](https://docs.phreshos.com/installation) for the
complete host and service workflow.

## Development

```sh
bun install --frozen-lockfile
bun run verify
bun run dev
```

Build or package the production release with:

```sh
bun run build
bun run pack
```

`verify` checks the source contracts and validates the packed System from a
clean installation.

## Related repositories

- [`@phreshos/core`](https://github.com/PhreshOS/core) owns the public contracts
  implemented by the System.
- [`@phreshos/client`](https://github.com/PhreshOS/client) and
  [`@phreshos/server`](https://github.com/PhreshOS/server) adapt Client and
  Server Endpoint boundaries.
- [`@phreshos/node`](https://github.com/PhreshOS/node) connects external Node.js
  code to a running System.
- [`@phreshos/cli`](https://github.com/PhreshOS/cli) installs and operates the
  System and its native service.
- [PhreshOS Documentation](https://github.com/PhreshOS/docs) owns the canonical
  public explanation of the runtime.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the repository workflow and
[SECURITY.md](SECURITY.md) for private vulnerability reporting.

## License

Licensed under the [MIT License](LICENSE). Copyright © 2026 Zohayr SLILEH.
