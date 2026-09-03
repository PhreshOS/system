import {
    clientPermissionCatalog,
    parsePermissionName,
    type ClientPermissions,
    type Permission,
    type PermissionDefinition,
    type PermissionDefinitions,
    type PermissionName,
    type PermissionValue,
    type Permissions
} from "@phreshos/core"

/** Validation and derivation over the one permission domain defined by Core. */
export class PermissionCatalog {

    private readonly definitions: PermissionDefinitions

    private readonly reloads: Readonly<Partial<Record<PermissionName, PermissionReload>>>

    public constructor(rules: PermissionRules) {

        const validated: Partial<Record<PermissionName, StoredDefinition>> = {}
        const reloads: Partial<Record<PermissionName, PermissionReload>> = {}

        for (const unknownName of Object.keys(rules)) {

            const name = parsePermissionName(unknownName)
            const rule = rules[name]

            if (!rule || typeof rule !== "object") throw new Error(`Permission "${name}" needs a definition`)
            if (rule.requiresReload !== undefined && typeof rule.requiresReload !== "function") throw new Error(`Permission "${name}" has an invalid reload resolver`)
            if (typeof rule.title !== "string" || !rule.title.trim()) throw new Error(`Permission "${name}" needs a title`)
            if (typeof rule.description !== "string" || !rule.description.trim()) throw new Error(`Permission "${name}" needs a description`)

            const values = clientPermissionCatalog[name] as readonly string[]
            const defaults = unique(strings(rule.default, `Permission "${name}" default`))

            if (defaults.some(value => !values.includes(value))) throw new Error(`Permission "${name}" has an invalid default`)

            validated[name] = Object.freeze({
                values,
                default: Object.freeze(defaults),
                title: rule.title,
                description: rule.description
            })

            if (rule.requiresReload) reloads[name] = rule.requiresReload as PermissionReload
        }

        for (const name of Object.keys(clientPermissionCatalog) as PermissionName[]) {

            if (!validated[name]) throw new Error(`Permission "${name}" needs a definition`)
        }

        this.definitions = Object.freeze(validated) as PermissionDefinitions
        this.reloads = Object.freeze(reloads)
    }

    public definition<Name extends PermissionName>(name: Name): PermissionDefinition<Name> {

        const definition = this.definitions[name]

        if (!definition) throw new Error(`The System does not know the permission "${String(name)}"`)

        return definition
    }

    public resolve<Name extends PermissionName>(name: Name, value: unknown): Permission<Name> {

        const definition = this.definition(name)

        if (value === true) return [...definition.default]
        if (value === false || value === null) return value

        const requested = unique(strings(value, `Permission "${name}"`))
        const values = definition.values as readonly string[]

        if (requested.some(entry => !values.includes(entry))) {
            throw new Error(`Permission "${name}" contains an unknown value`)
        }

        return values.filter(entry => requested.includes(entry)) as PermissionValue<Name>[]
    }

    public declarations(value: unknown): ClientPermissions {

        if (value === undefined) return Object.freeze({})
        if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("A Client's permissions must be a record")

        const resolved: Partial<Record<PermissionName, readonly string[]>> = {}

        for (const [unknownName, assignment] of Object.entries(value)) {

            const name = parsePermissionName(unknownName)
            const permission = this.resolve(name, assignment)

            if (!Array.isArray(permission)) throw new Error("A Client-declared permission must be true or a list of values")

            resolved[name] = Object.freeze(permission)
        }

        return Object.freeze(resolved) as ClientPermissions
    }

    public stored(value: unknown): Permissions {

        if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("The Program permissions file is invalid")

        const permissions: Partial<Record<PermissionName, Permission>> = {}

        for (const [unknownName, assignment] of Object.entries(value)) {

            const name = parsePermissionName(unknownName)

            if (assignment === true) throw new Error("The Program permissions file contains unresolved shorthand")

            permissions[name] = this.resolve(name, assignment)
        }

        return permissions as Permissions
    }

    public grants<Name extends PermissionName>(grant: PermissionGrant<Name>, requested: readonly PermissionValue<Name>[]) {

        return Array.isArray(grant) && requested.every(value => grant.includes(value))
    }

    /** Whether one value-less or valued permission is present at all. */
    public granted(permission: PermissionGrant) {

        return Array.isArray(permission)
    }

    /** Applies the value-less all grant before one permission's own values. */
    public allows<Name extends PermissionName>(
        name: Name,
        all: PermissionGrant<"all">,
        permission: PermissionGrant<Name>,
        requested: readonly PermissionValue<Name>[]
    ) {

        this.definition(name)

        return this.granted(all) || this.grants(permission, requested)
    }

    public combine<Name extends PermissionName>(name: Name, ...grants: PermissionGrant<Name>[]): Permission<Name> {

        const present = grants.filter((grant): grant is readonly PermissionValue<Name>[] => Array.isArray(grant))

        return present.length
            ? present.reduce<PermissionValue<Name>[]>((combined, grant) => this.merge(name, combined, grant), [])
            : null
    }

    public effective<Name extends PermissionName>(name: Name, ...grants: PermissionGrant<Name>[]): Permission<Name> {

        return this.combine(name, ...grants) ?? (grants.includes(false) ? false : null)
    }

    public merge<Name extends PermissionName>(
        name: Name,
        grant: PermissionGrant<Name>,
        requested: readonly PermissionValue<Name>[]
    ): PermissionValue<Name>[] {

        const current = Array.isArray(grant) ? grant : []

        return this.resolve(name, [...current, ...requested]) as PermissionValue<Name>[]
    }

    public changed<Name extends PermissionName>(left: Permission<Name>, right: Permission<Name>) {

        if (!Array.isArray(left) || !Array.isArray(right)) return left !== right

        return left.length !== right.length || left.some(value => !right.includes(value))
    }

    /** Resolves one concrete effective-grant transition when it occurs. */
    public needReload<Name extends PermissionName>(name: Name, before: Permission<Name>, permission: Permission<Name>) {

        if (!this.changed(before, permission)) return false

        return this.reloads[name]?.(clone(before), clone(permission)) === true
    }
}

type PermissionGrant<Name extends PermissionName = PermissionName> = readonly PermissionValue<Name>[] | false | null

type PermissionReload<Name extends PermissionName = PermissionName> = (
    before: Permission<Name>,
    permission: Permission<Name>
) => boolean

type PermissionRule<Name extends PermissionName> = Omit<PermissionDefinition<Name>, "values"> & Readonly<{
    requiresReload?: PermissionReload<Name>
}>

type PermissionRules = Readonly<{
    [Name in PermissionName]: PermissionRule<Name>
}>

type StoredDefinition = Readonly<{
    values: readonly string[]
    default: readonly string[]
    title: string
    description: string
}>

function clone<Name extends PermissionName>(permission: Permission<Name>): Permission<Name> {

    return Array.isArray(permission) ? [...permission] : permission
}

function strings(value: unknown, subject: string): string[] {

    if (!Array.isArray(value) || value.some(entry => typeof entry !== "string")) throw new Error(`${subject} must be a list of strings`)

    return value
}

function unique(values: readonly string[]) {

    return [...new Set(values)]
}

/** The presentation and activation rules for every Core-defined permission. */
export const permissionCatalog = new PermissionCatalog({
    all: {
        default: [],
        title: "All permissions",
        description: "Grant every available Client permission.",
        requiresReload: (before, permission) => Array.isArray(before) !== Array.isArray(permission)
    }
})
