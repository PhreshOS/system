import assert from "node:assert/strict"
import { parsePermissionName } from "@phreshos/core"
import { PermissionCatalog, permissionCatalog } from "@server/core/permissions"

const catalog = new PermissionCatalog({
    all: {
        default: [],
        title: "All permissions",
        description: "Grant every available Client permission.",
        requiresReload: (before, permission) => Array.isArray(before) !== Array.isArray(permission)
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

assert.deepEqual(catalog.definition("all"), {
    valueDomain: "none",
    default: [],
    title: "All permissions",
    description: "Grant every available Client permission."
})
assert.deepEqual(catalog.definition("programs"), {
    valueDomain: "program",
    default: [],
    title: "Programs",
    description: "Access every Program or selected Programs and their Services."
})
assert.deepEqual(catalog.definition("network"), {
    valueDomain: "network",
    default: [],
    title: "Network",
    description: "Use System networking with every request target or selected target scopes."
})
assert.deepEqual(catalog.resolve("all", true), [])
assert.deepEqual(catalog.resolve("all", []), [])
assert.deepEqual(catalog.resolve("services", true), [])
assert.deepEqual(catalog.resolve("services", ["flambo", "terminal", "flambo"]), ["flambo", "terminal"])
assert.deepEqual(catalog.resolve("network", ["HTTPS://API.Example.com:443/v1/**"]), ["https://api.example.com/v1/**"])
assert.equal(catalog.resolve("all", false), false)
assert.equal(catalog.resolve("all", null), null)

assert.deepEqual(catalog.declarations({ all: true, services: ["flambo"] }), { all: [], services: ["flambo"] })
assert(Object.isFrozen(catalog.declarations({})))
assert(Object.isFrozen(catalog.declarations({ all: true }).all))

assert(catalog.grants("all", [], []))
assert(!catalog.grants("all", false, []))
assert(!catalog.grants("all", null, []))
assert(catalog.grants("services", [], []))
assert(catalog.grants("services", [], ["flambo"]))
assert(catalog.grants("services", ["flambo"], ["flambo"]))
assert(!catalog.grants("services", ["flambo"], ["terminal"]))
assert(!catalog.grants("services", ["flambo"], []))
assert(catalog.grants("network", ["https://api.example.com"], ["https://api.example.com/v1/users"]))
assert(catalog.grants("network", ["https://*.example.com/v1/**"], ["https://eu.example.com/v1/users"]))
assert(!catalog.grants("network", ["https://*.example.com/v1/**"], ["https://example.com/v1/users"]))
assert(!catalog.grants("network", ["https://api.example.com/v1/**"], ["https://api.example.com/v2/users"]))
assert(catalog.allows("all", [], null, []))
assert(!catalog.allows("all", null, null, []))
assert(catalog.allows("services", [], null, ["flambo"]))
assert(catalog.allows("services", null, ["flambo"], ["flambo"]))
assert.equal(catalog.combine("all", null, false), null)
assert.deepEqual(catalog.combine("all", []), [])
assert.deepEqual(catalog.combine("services", ["flambo"], ["terminal"]), ["flambo", "terminal"])
assert.deepEqual(catalog.combine("services", ["flambo"], []), [])
assert.deepEqual(catalog.combine("network", ["https://api.example.com"], ["wss://events.example.com"]), [
    "https://api.example.com",
    "wss://events.example.com"
])
assert.equal(catalog.effective("all", null, false), false)
assert.deepEqual(catalog.effective("all", [], false), [])
assert.deepEqual(catalog.merge("all", null, []), [])
assert.deepEqual(catalog.merge("services", ["flambo"], ["terminal"]), ["flambo", "terminal"])
assert.deepEqual(catalog.merge("services", ["flambo"], []), [])
assert.deepEqual(catalog.merge("services", [], ["flambo"]), [])
assert.deepEqual(catalog.merge("network", ["https://api.example.com"], ["wss://events.example.com"]), [
    "https://api.example.com",
    "wss://events.example.com"
])
assert(!catalog.changed([], []))
assert(!catalog.changed(["flambo", "terminal"], ["terminal", "flambo"]))
assert(catalog.changed(["flambo"], []))

assert(catalog.needReload("all", null, []))
assert(catalog.needReload("all", [], null))
assert(!catalog.needReload("all", [], []))
assert(!catalog.needReload("services", null, []))
assert(!catalog.needReload("programs", ["flambo"], []))
assert(!catalog.needReload("network", null, []))
assert(!catalog.needReload("appearance", null, []))
assert(!catalog.needReload("desktopPreferences", null, []))

assert.throws(() => parsePermissionName("files"), /does not know/)
assert.throws(() => catalog.resolve("all", ["unknown"]), /unknown value/)
assert.throws(() => catalog.resolve("appearance", ["flambo"]), /unknown value/)
assert.throws(() => catalog.resolve("services", ["Not a Program"]), /unknown value/)
assert.throws(() => catalog.resolve("network", ["api.example.com"]), /unknown value/)
assert.throws(() => catalog.declarations({ all: ["unknown"] }), /unknown value/)
assert.throws(() => catalog.stored({ all: true }), /unresolved shorthand/)
assert.throws(() => new PermissionCatalog({} as never), /needs a definition/)
assert.throws(() => new PermissionCatalog({
    all: {
        default: ["unknown"],
        title: "All permissions",
        description: "Invalid default."
    },
    services: catalog.definition("services"),
    programs: catalog.definition("programs"),
    network: catalog.definition("network"),
    appearance: catalog.definition("appearance"),
    desktopPreferences: catalog.definition("desktopPreferences")
} as never), /invalid default/)

assert.deepEqual(permissionCatalog.resolve("all", true), [])
assert.deepEqual(permissionCatalog.declarations({ all: true }), { all: [] })
assert.deepEqual(permissionCatalog.declarations({ programs: true }), { programs: [] })
assert(permissionCatalog.granted([]))
assert(!permissionCatalog.granted(null))
assert.throws(() => permissionCatalog.definition("files" as never), /does not know/)
