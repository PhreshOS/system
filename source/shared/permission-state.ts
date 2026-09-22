import {
    networkScopeCovers,
    programPermissionCatalog,
    type PermissionName,
    type PermissionValue,
    type Permissions
} from "@phreshos/core"

/** Evaluates permissions whose complete meaning is available in the browser. */
export function allowsSynchronizedPermission<Name extends PermissionName>(
    permissions: Permissions,
    name: Name,
    requested: readonly PermissionValue<Name>[]
) {

    if (name === "desktopConnection" && allowsSynchronizedPermission(permissions, "connections", [])) return true

    const assigned = permissions[name]

    // An exact assignment is final. `all` is only a fallback for permissions
    // with no stored or declared assignment of their own.
    if (assigned !== undefined && assigned !== null) return grants(name, assigned, requested)

    return name !== "all" && Array.isArray(permissions.all)
}

function grants<Name extends PermissionName>(
    name: Name,
    assigned: Permissions[Name],
    requested: readonly PermissionValue<Name>[]
) {

    if (!Array.isArray(assigned)) return false

    const domain = programPermissionCatalog[name]

    if (domain === "none") return requested.length === 0

    if (assigned.length === 0) return true
    if (requested.length === 0) return false

    return requested.every(value => assigned.some(granted => covers(domain, granted, value)))
}

function covers(domain: (typeof programPermissionCatalog)[PermissionName], granted: string, requested: string) {

    if (domain === "network") return networkScopeCovers(granted, requested)

    // Native Storage authority is deliberately evaluated at the host because
    // canonical paths and symlink resolution do not exist in the browser.
    if (domain === "storage") throw new Error("Storage permission requires host path resolution")

    if (domain === "program" || domain === "service" || domain === "layer") return granted === requested
    if (domain === "none") return false

    domain satisfies never

    return false
}
