import assert from "node:assert/strict"
import { PermissionCatalog, permissionCatalog } from "@server/core/permissions"

const catalog = new PermissionCatalog({
    files: {
        values: ["read", "write"],
        default: ["read"],
        title: "Files",
        description: "Access selected files."
    },
    environment: {
        values: ["locale", "isolation"],
        default: ["locale"],
        title: "Environment",
        description: "Access the Client environment.",
        requiresReload(before, permission) {
            const isolated = (value: typeof before) => Array.isArray(value) && value.includes("isolation")
            return isolated(before) !== isolated(permission)
        }
    }
})

assert.deepEqual(catalog.resolve("files", true), ["read"])
assert.deepEqual(catalog.resolve("files", ["write", "read"]), ["read", "write"])
assert.deepEqual(catalog.resolve("files", ["write", "read", "write"]), ["read", "write"])
assert.deepEqual(catalog.resolve("environment", true), ["locale"])
assert.equal(catalog.resolve("files", false), false)
assert.equal(catalog.resolve("files", null), null)

assert.deepEqual(catalog.declarations({ files: true, environment: [] }), {
    files: ["read"],
    environment: []
})
assert(Object.isFrozen(catalog.declarations({})))
assert(Object.isFrozen(catalog.declarations({ files: true }).files))

assert(catalog.grants(["read", "write"], ["write"]))
assert(!catalog.grants(false, ["read"]))
assert(!catalog.grants(null, []))
assert(catalog.grants([], []))
assert.equal(catalog.combine("files", null, false), null)
assert.deepEqual(catalog.combine("files", ["write"], ["read"]), ["read", "write"])
assert.equal(catalog.effective("files", null, false), false)
assert.deepEqual(catalog.effective("files", ["read"], false), ["read"])
assert.deepEqual(catalog.effective("environment", []), [])
assert.deepEqual(catalog.merge("files", ["read"], ["write"]), ["read", "write"])
assert(!catalog.changed(["read", "write"], ["write", "read"]))

assert(!catalog.needReload("files", ["read"], ["read", "write"]))
assert(!catalog.needReload("environment", null, ["locale"]))
assert(catalog.needReload("environment", ["locale"], ["locale", "isolation"]))
assert(!catalog.needReload("environment", ["locale", "isolation"], ["locale", "isolation"]))

assert.throws(() => catalog.resolve("unknown", true), /does not know/)
assert.throws(() => catalog.resolve("files", ["delete"]), /unknown value/)
assert.throws(() => catalog.declarations({ files: ["delete"] }), /unknown value/)
assert.throws(() => catalog.stored({ files: true }), /unresolved shorthand/)
assert.throws(() => new PermissionCatalog({
    invalid: {
        values: ["read"],
        default: ["write"],
        title: "Invalid",
        description: "Invalid default."
    }
}), /invalid default/)

assert.deepEqual(permissionCatalog.definition("system"), {
    values: ["all"],
    default: ["all"],
    title: "System",
    description: "Access every System capability."
})
assert.deepEqual(permissionCatalog.resolve("system", true), ["all"])
assert.deepEqual(permissionCatalog.declarations({ system: true }), { system: ["all"] })
assert(permissionCatalog.grants(["all"], ["all"]))
assert(!permissionCatalog.grants(null, ["all"]))
assert(!permissionCatalog.needReload("system", null, ["all"]))
assert(!permissionCatalog.needReload("system", ["all"], null))
assert.throws(() => permissionCatalog.definition("files"), /does not know/)
