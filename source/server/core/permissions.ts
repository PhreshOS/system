import {
    clientPermissionCatalog,
    networkScopeCovers,
    parsePermission,
    parsePermissionName,
    type ClientPermissions,
    type Permission,
    type PermissionDefinition,
    type PermissionDefinitions,
    type PermissionName,
    type PermissionValue,
    type PermissionValueDomain,
    type Permissions,
    type StoragePermissionOperation
} from "@phreshos/core"
import { nativeStorageScopeAccesses, nativeStorageScopeCovers } from "./storage-permission"

/** Validation and derivation over the one permission domain defined by Core. */
export class PermissionCatalog {

    private readonly definitions: PermissionDefinitions

    public constructor(rules: PermissionRules) {

        const validated: Partial<Record<PermissionName, StoredDefinition>> = {}

        for (const unknownName of Object.keys(rules)) {

            const name = parsePermissionName(unknownName)
            const rule = rules[name]

            if (!rule || typeof rule !== "object") throw new Error(`Permission "${name}" needs a definition`)
            if (typeof rule.title !== "string" || !rule.title.trim()) throw new Error(`Permission "${name}" needs a title`)
            if (typeof rule.description !== "string" || !rule.description.trim()) throw new Error(`Permission "${name}" needs a description`)

            let defaults: PermissionValue<typeof name>[]

            try {

                const parsed = parsePermission(name, rule.default)

                if (!Array.isArray(parsed)) throw new Error()

                defaults = parsed
            }

            catch {

                throw new Error(`Permission "${name}" has an invalid default`)
            }

            validated[name] = Object.freeze({
                valueDomain: clientPermissionCatalog[name],
                default: Object.freeze(defaults),
                title: rule.title,
                description: rule.description
            })

        }

        for (const name of Object.keys(clientPermissionCatalog) as PermissionName[]) {

            if (!validated[name]) throw new Error(`Permission "${name}" needs a definition`)
        }

        this.definitions = Object.freeze(validated) as PermissionDefinitions
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

        try {

            const parsed = parsePermission(name, requested)

            if (Array.isArray(parsed)) return parsed
        }

        catch { }

        throw new Error(`Permission "${name}" contains an unknown value`)
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

    public grants<Name extends PermissionName>(name: Name, grant: PermissionGrant, requested: readonly PermissionValue<Name>[]) {

        if (!Array.isArray(grant)) return false

        const domain = this.definition(name).valueDomain

        if (valued(domain)) {

            return grant.length === 0 || (requested.length > 0 && requested.every(value => {

                return grant.some(granted => valueCovers(domain, granted, value))
            }))
        }

        return requested.length === 0
    }

    /** Whether one value-less or valued permission is present at all. */
    public granted(permission: PermissionGrant) {

        return Array.isArray(permission)
    }

    /** Tests complete authority, including grants implied by another permission. */
    public allows<Name extends PermissionName>(
        name: Name,
        requested: readonly PermissionValue<Name>[],
        ...sources: PermissionGrants[]
    ) {

        this.definition(name)

        const effective = (key: PermissionName) => this.effective(key, ...sources.map(source => source[key] ?? null))

        if (this.granted(effective("all"))) return true

        const permission = name === "services"
            ? this.combine("services", effective("services"), effective("programs"))
            : effective(name)

        return this.grants(name, permission, requested)
    }

    /** Tests one native Storage path against the complete effective authority. */
    public allowsStorage(
        all: PermissionGrant,
        storage: PermissionGrant,
        path: string,
        operation?: StoragePermissionOperation
    ) {

        if (this.granted(all)) return true
        if (!Array.isArray(storage)) return false
        if (storage.length === 0) return true

        return storage.some(scope => nativeStorageScopeAccesses(scope, path, operation))
    }

    public combine<Name extends PermissionName>(name: Name, ...grants: PermissionGrant[]): Permission<Name> {

        const present = grants.filter((grant): grant is readonly string[] => Array.isArray(grant))

        if (present.length === 0) return null
        if (!valued(this.definition(name).valueDomain)) return []
        if (present.some(grant => grant.length === 0)) return []

        return this.resolve(name, present.flat()) as PermissionValue<Name>[]
    }

    public effective<Name extends PermissionName>(name: Name, ...grants: PermissionGrant[]): Permission<Name> {

        return this.combine(name, ...grants) ?? (grants.includes(false) ? false : null)
    }

    public merge<Name extends PermissionName>(
        name: Name,
        grant: PermissionGrant,
        requested: readonly PermissionValue<Name>[]
    ): PermissionValue<Name>[] {

        if (!Array.isArray(grant)) return [...requested]
        if (valued(this.definition(name).valueDomain) && (grant.length === 0 || requested.length === 0)) return []

        return this.resolve(name, [...grant, ...requested]) as PermissionValue<Name>[]
    }

    public changed<Name extends PermissionName>(left: Permission<Name>, right: Permission<Name>) {

        if (!Array.isArray(left) || !Array.isArray(right)) return left !== right

        return left.length !== right.length || left.some(value => !right.includes(value))
    }

}

type PermissionGrant = readonly string[] | false | null

type PermissionGrants = Readonly<Partial<Record<PermissionName, PermissionGrant>>>

type PermissionRule<Name extends PermissionName> = Omit<PermissionDefinition<Name>, "valueDomain">

type PermissionRules = Readonly<{
    [Name in PermissionName]: PermissionRule<Name>
}>

type StoredDefinition = Readonly<{
    valueDomain: PermissionValueDomain
    default: readonly string[]
    title: string
    description: string
}>

function strings(value: unknown, subject: string): string[] {

    if (!Array.isArray(value) || value.some(entry => typeof entry !== "string")) throw new Error(`${subject} must be a list of strings`)

    return value
}

function unique(values: readonly string[]) {

    return [...new Set(values)]
}

function valued(domain: PermissionValueDomain) {

    if (domain === "program" || domain === "network" || domain === "storage") return true
    if (domain === "none") return false

    domain satisfies never

    throw new Error("The System does not know this permission value domain")
}

function valueCovers(domain: PermissionValueDomain, grant: string, requested: string) {

    if (domain === "program") return grant === requested
    if (domain === "network") return networkScopeCovers(grant, requested)
    if (domain === "storage") return nativeStorageScopeCovers(grant, requested)
    if (domain === "none") return false

    domain satisfies never

    return false
}

/** The presentation and defaults for every Core-defined permission. */
export const permissionCatalog = new PermissionCatalog({
    all: {
        default: [],
        title: "All permissions",
        description: "Grant every available Client permission."
    },
    services: {
        default: [],
        title: "Services",
        description: "Access Services belonging to every Program or selected Programs."
    },
    programs: {
        default: [],
        title: "Programs",
        description: "Access every Program or selected Programs and their Services."
    },
    network: {
        default: [],
        title: "Network",
        description: "Use System networking with every request target or selected target scopes."
    },
    storage: {
        default: [],
        title: "Storage",
        description: "Use every native filesystem path or selected operation-and-path scopes."
    },
    uploads: {
        default: [],
        title: "Uploads",
        description: "Create values in the System uploads collection."
    },
    appearance: {
        default: [],
        title: "Appearance",
        description: "Change the System Appearance."
    },
    desktopPreferences: {
        default: [],
        title: "Desktop preferences",
        description: "Change this Desktop's preferences."
    }
})
