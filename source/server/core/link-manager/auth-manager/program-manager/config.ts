import type { ClientDefinition, ProgramDefinition, ServerDefinition } from "@phreshos/core"

/**
 * A Program definition as stored in `program.json`.
 *
 * Creation consumes Core's exact `ProgramDefinition`. Installation removes
 * `storage`, because the System then owns the Program's canonical storage
 * location. This is the only difference in the durable representation.
 */
export type ProgramConfig = ProgramDefinition extends infer Definition
    ? Definition extends ProgramDefinition
        ? Omit<Definition, "storage"> & Readonly<{ storage?: string }>
        : never
    : never

export type ServerConfig = ServerDefinition
export type ClientConfig = ClientDefinition

export { layers, type Layer, type Position, type Size, type Value } from "@phreshos/core"
export { isRelativeValue as isValue } from "@phreshos/core"

/** Stable Program identities are also safe directory names. */
export const kebab = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
