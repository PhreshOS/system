import assert from "node:assert/strict"
import { parsePermissionName } from "@phreshos/core"
import { PermissionCatalog, permissionCatalog } from "@server/core/permissions"

const catalog = new PermissionCatalog({
    all: {
        default: [],
        title: "All permissions",
        description: "Grant every available Client permission.",
        requiresReload: (before, permission) => Array.isArray(before) !== Array.isArray(permission)
    }
})

assert.deepEqual(catalog.definition("all"), {
    values: [],
    default: [],
    title: "All permissions",
    description: "Grant every available Client permission."
})
assert.deepEqual(catalog.resolve("all", true), [])
assert.deepEqual(catalog.resolve("all", []), [])
assert.equal(catalog.resolve("all", false), false)
assert.equal(catalog.resolve("all", null), null)

assert.deepEqual(catalog.declarations({ all: true }), { all: [] })
assert(Object.isFrozen(catalog.declarations({})))
assert(Object.isFrozen(catalog.declarations({ all: true }).all))

assert(catalog.grants([], []))
assert(!catalog.grants(false, []))
assert(!catalog.grants(null, []))
assert(catalog.allows("all", [], null, []))
assert(!catalog.allows("all", null, null, []))
assert.equal(catalog.combine("all", null, false), null)
assert.deepEqual(catalog.combine("all", []), [])
assert.equal(catalog.effective("all", null, false), false)
assert.deepEqual(catalog.effective("all", [], false), [])
assert.deepEqual(catalog.merge("all", null, []), [])
assert(!catalog.changed([], []))

assert(catalog.needReload("all", null, []))
assert(catalog.needReload("all", [], null))
assert(!catalog.needReload("all", [], []))

assert.throws(() => parsePermissionName("files"), /does not know/)
assert.throws(() => catalog.resolve("all", ["unknown"]), /unknown value/)
assert.throws(() => catalog.declarations({ all: ["unknown"] }), /unknown value/)
assert.throws(() => catalog.stored({ all: true }), /unresolved shorthand/)
assert.throws(() => new PermissionCatalog({} as never), /needs a definition/)
assert.throws(() => new PermissionCatalog({
    all: {
        default: ["unknown"],
        title: "All permissions",
        description: "Invalid default."
    }
} as never), /invalid default/)

assert.deepEqual(permissionCatalog.resolve("all", true), [])
assert.deepEqual(permissionCatalog.declarations({ all: true }), { all: [] })
assert(permissionCatalog.granted([]))
assert(!permissionCatalog.granted(null))
assert.throws(() => permissionCatalog.definition("files" as never), /does not know/)
