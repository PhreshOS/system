import {
    type ClientPermissions,
    type Permission,
    type PermissionDefinition,
    type Permissions
} from "@phreshos/core"
import { isDeepStrictEqual } from "node:util"

/** Validation and derivation over one exact permission definition set. */
export class PermissionCatalog {

    private readonly definitions: Readonly<Record<string, PermissionDefinition>>

    public constructor(definitions: Readonly<Record<string, PermissionDefinition>>) {

        const validated: Record<string, PermissionDefinition> = {}

        for (const [name, definition] of Object.entries(definitions)) {

            if (!name.length || !definition || typeof definition !== "object") throw new Error("A permission definition needs a name and definition")
            if (definition.activation !== "live" && definition.activation !== "reload") throw new Error(`Permission "${name}" has an invalid activation`)
            if (typeof definition.title !== "string" || !definition.title.trim()) throw new Error(`Permission "${name}" needs a title`)
            if (typeof definition.description !== "string" || !definition.description.trim()) throw new Error(`Permission "${name}" needs a description`)

            const values = strings(definition.values, `Permission "${name}" values`)
            const defaults = strings(definition.default, `Permission "${name}" default`)

            if (values.length !== new Set(values).size) throw new Error(`Permission "${name}" values must be unique`)
            if (defaults.length !== new Set(defaults).size || defaults.some(value => !values.includes(value))) throw new Error(`Permission "${name}" has an invalid default`)

            validated[name] = Object.freeze({
                values: Object.freeze([...values]),
                default: Object.freeze([...defaults]),
                activation: definition.activation,
                title: definition.title,
                description: definition.description
            })
        }

        this.definitions = Object.freeze(validated)
    }

    public definition(name: unknown) {

        if (typeof name !== "string" || !Object.hasOwn(this.definitions, name)) throw new Error(`The System does not know the permission "${String(name)}"`)

        return this.definitions[name]
    }

    public resolve(name: unknown, value: unknown): Permission {

        const definition = this.definition(name)

        if (value === true) return [...definition.default]
        if (value === false || value === null) return value

        const requested = strings(value, `Permission "${String(name)}"`)

        if (requested.length !== new Set(requested).size || requested.some(entry => !definition.values.includes(entry))) {
            throw new Error(`Permission "${String(name)}" contains an unknown value`)
        }

        return definition.values.filter(entry => requested.includes(entry))
    }

    public declarations(value: unknown): ClientPermissions {

        if (value === undefined) return Object.freeze({})
        if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("A Client's permissions must be a record")

        const resolved: Record<string, readonly string[]> = {}

        for (const [name, assignment] of Object.entries(value)) {

            const permission = this.resolve(name, assignment)

            if (!Array.isArray(permission)) throw new Error(`A Client-declared permission must be true or a list of values`)

            resolved[name] = Object.freeze(permission)
        }

        return Object.freeze(resolved)
    }

    public stored(value: unknown): Permissions {

        if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("The Program permissions file is invalid")

        const permissions: Permissions = {}

        for (const [name, assignment] of Object.entries(value)) {

            if (assignment === true) throw new Error("The Program permissions file contains unresolved shorthand")

            permissions[name] = this.resolve(name, assignment)
        }

        return permissions
    }

    public grants(grant: PermissionGrant, requested: readonly string[]) {

        return Array.isArray(grant) && requested.every(value => grant.includes(value))
    }

    public combine(name: string, ...grants: PermissionGrant[]): Permission {

        const present = grants.filter((grant): grant is readonly string[] => Array.isArray(grant))

        return present.length
            ? present.reduce<string[]>((combined, grant) => this.merge(name, combined, grant), [])
            : null
    }

    public effective(name: string, ...grants: PermissionGrant[]): Permission {

        return this.combine(name, ...grants) ?? (grants.includes(false) ? false : null)
    }

    public merge(name: string, grant: PermissionGrant, requested: readonly string[]) {

        const current = Array.isArray(grant) ? grant : []

        return this.resolve(name, [...current, ...requested]) as string[]
    }

    public changed(left: Permission, right: Permission) {

        return !isDeepStrictEqual(left, right)
    }

    public needReload(name: string, changed: boolean) {

        return changed && this.definition(name).activation === "reload"
    }
}

type PermissionGrant = readonly string[] | false | null

function strings(value: unknown, subject: string): string[] {

    if (!Array.isArray(value) || value.some(entry => typeof entry !== "string")) throw new Error(`${subject} must be a list of strings`)

    return value
}

/** The complete permission domain recognized by this System release. */
export const permissionCatalog = new PermissionCatalog({})
