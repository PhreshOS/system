import {
    type ClientPermissions,
    type Permission,
    type PermissionDefinition,
    type Permissions
} from "@phreshos/core"

/** Validation and derivation over one exact permission definition set. */
export class PermissionCatalog {

    private readonly definitions: Readonly<Record<string, PermissionDefinition>>

    private readonly reloads: Readonly<Record<string, PermissionReload>>

    public constructor(rules: Readonly<Record<string, PermissionRule>>) {

        const validated: Record<string, PermissionDefinition> = {}
        const reloads: Record<string, PermissionReload> = {}

        for (const [name, rule] of Object.entries(rules)) {

            if (!name.length || !rule || typeof rule !== "object") throw new Error("A permission definition needs a name and definition")
            if (rule.requiresReload !== undefined && typeof rule.requiresReload !== "function") throw new Error(`Permission "${name}" has an invalid reload resolver`)
            if (typeof rule.title !== "string" || !rule.title.trim()) throw new Error(`Permission "${name}" needs a title`)
            if (typeof rule.description !== "string" || !rule.description.trim()) throw new Error(`Permission "${name}" needs a description`)

            const values = unique(strings(rule.values, `Permission "${name}" values`))
            const defaults = unique(strings(rule.default, `Permission "${name}" default`))

            if (defaults.some(value => !values.includes(value))) throw new Error(`Permission "${name}" has an invalid default`)

            validated[name] = Object.freeze({
                values: Object.freeze([...values]),
                default: Object.freeze([...defaults]),
                title: rule.title,
                description: rule.description
            })

            if (rule.requiresReload) reloads[name] = rule.requiresReload
        }

        this.definitions = Object.freeze(validated)
        this.reloads = Object.freeze(reloads)
    }

    public definition(name: unknown) {

        if (typeof name !== "string" || !Object.hasOwn(this.definitions, name)) throw new Error(`The System does not know the permission "${String(name)}"`)

        return this.definitions[name]
    }

    public resolve(name: unknown, value: unknown): Permission {

        const definition = this.definition(name)

        if (value === true) return [...definition.default]
        if (value === false || value === null) return value

        const requested = unique(strings(value, `Permission "${String(name)}"`))

        if (requested.some(entry => !definition.values.includes(entry))) {
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

    /** Whether one value-less or valued permission is present at all. */
    public granted(permission: PermissionGrant) {

        return Array.isArray(permission)
    }

    /** Applies the value-less all grant before one permission's own values. */
    public allows(name: string, all: PermissionGrant, permission: PermissionGrant, requested: readonly string[]) {

        this.definition(name)

        return this.granted(all) || this.grants(permission, requested)
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

        if (!Array.isArray(left) || !Array.isArray(right)) return left !== right

        return left.length !== right.length || left.some(value => !right.includes(value))
    }

    /** Resolves one concrete effective-grant transition when it occurs. */
    public needReload(name: string, before: Permission, permission: Permission) {

        this.definition(name)

        if (!this.changed(before, permission)) return false

        return this.reloads[name]?.(clone(before), clone(permission)) === true
    }
}

type PermissionGrant = readonly string[] | false | null

type PermissionReload = (before: Permission, permission: Permission) => boolean

type PermissionRule = PermissionDefinition & Readonly<{
    requiresReload?: PermissionReload
}>

function clone(permission: Permission): Permission {

    return Array.isArray(permission) ? [...permission] : permission
}

function strings(value: unknown, subject: string): string[] {

    if (!Array.isArray(value) || value.some(entry => typeof entry !== "string")) throw new Error(`${subject} must be a list of strings`)

    return value
}

function unique(values: string[]) {

    return [...new Set(values)]
}

/** The complete permission domain recognized by this System release. */
export const permissionCatalog = new PermissionCatalog({
    all: {
        values: [],
        default: [],
        title: "All permissions",
        description: "Grant every available Client permission.",
        requiresReload: (before, permission) => Array.isArray(before) !== Array.isArray(permission)
    }
})
