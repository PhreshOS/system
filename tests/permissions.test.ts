import assert from "node:assert/strict"
import { parsePermissionName } from "@phreshos/core"
import { PermissionCatalog, permissionCatalog } from "@server/core/permissions"
import { test } from "vitest"

test("permissions contract", async () => {
  const catalog = new PermissionCatalog({
      all: {
          default: []
      },
      services: {
          default: []
      },
      programs: {
          default: []
      },
      layers: {
          default: []
      },
      network: {
          default: []
      },
      storage: {
          default: []
      },
      uploads: {
          default: []
      },
      logs: {
          default: []
      },
      appearance: {
          default: []
      },
      desktopPreferences: {
          default: []
      },
      desktopConnection: {
          default: []
      },
      authentication: {
          default: []
      }
  })

  assert.deepEqual(catalog.definition("all"), {
      valueDomain: "none",
      default: []
  })
  assert.deepEqual(catalog.definition("programs"), {
      valueDomain: "program",
      default: []
  })
  assert.deepEqual(catalog.definition("network"), {
      valueDomain: "network",
      default: []
  })
  assert.deepEqual(catalog.definition("storage"), {
      valueDomain: "storage",
      default: []
  })
  assert.deepEqual(catalog.definition("uploads"), {
      valueDomain: "none",
      default: []
  })
  assert.deepEqual(catalog.resolve("all", true), [])
  assert.deepEqual(catalog.resolve("all", []), [])
  assert.deepEqual(catalog.resolve("services", true), [])
  assert.deepEqual(catalog.resolve("services", ["flambo", "terminal", "flambo"]), ["flambo", "terminal"])
  assert.deepEqual(catalog.resolve("network", ["HTTPS://API.Example.com:443/v1/**"]), ["https://api.example.com/v1/**"])
  assert.deepEqual(catalog.resolve("storage", ["delete,read:Documents/**"]), ["read,delete:Documents/**"])
  assert.deepEqual(catalog.resolve("uploads", true), [])
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
  assert(catalog.grants("storage", ["Documents/**"], ["read:Documents/report.txt"]))
  assert(catalog.grants("storage", ["read,delete:Documents/**"], ["delete:Documents/old.txt"]))
  assert(!catalog.grants("storage", ["read:Documents/**"], ["write:Documents/report.txt"]))
  assert(!catalog.grants("storage", ["Documents/report.txt"], ["read:Documents/**"]))
  assert(catalog.allows("all", [], { all: [] }))
  assert(!catalog.allows("all", [], {}))
  assert(catalog.allows("services", ["browser"], { all: [] }))
  assert(catalog.allows("services", ["browser"], { services: ["browser"] }))
  assert(!catalog.allows("services", ["browser"], { programs: [] }))
  assert(!catalog.allows("services", [], { programs: [] }))
  assert(!catalog.allows("services", ["browser"], { programs: ["browser"] }))
  assert(!catalog.allows("services", ["browser", "editor"], { programs: ["browser"], services: ["editor"] }))
  assert(catalog.allows("services", ["editor"], { programs: ["browser"], services: ["editor"] }))
  assert(!catalog.allows("services", ["editor"], { programs: ["browser"] }))
  assert(!catalog.allows("services", [], { programs: ["browser"] }))
  assert(!catalog.allows("programs", ["browser"], { services: [] }))
  assert(!catalog.allows("services", ["browser"], { programs: [], services: false }))
  assert(catalog.allows("desktopConnection", [], { desktopConnection: [] }))
  assert(catalog.allows("desktopConnection", [], { authentication: [] }))
  assert(catalog.allows("desktopConnection", [], { authentication: [], desktopConnection: false }))
  assert(!catalog.allows("authentication", [], { desktopConnection: [] }))
  assert(catalog.allows("desktopConnection", [], { all: [], authentication: false }))
  assert(!catalog.allows("desktopConnection", [], { all: [], authentication: false, desktopConnection: false }))
  assert(!catalog.allows("network", ["https://elsewhere.example"], { all: [], network: ["https://api.example.com"] }))
  assert(catalog.allows("network", ["https://api.example.com/v1"], { all: [], network: ["https://api.example.com"] }))
  assert(catalog.allowsStorage([], null, "Documents/report.txt", "read"))
  assert(catalog.allowsStorage([], ["read:Documents/**"], "Documents/report.txt", "read"))
  assert(!catalog.allowsStorage([], ["read:Documents/**"], "Pictures/photo.png", "read"))
  assert(!catalog.allowsStorage([], false, "Documents/report.txt", "read"))
  assert(!catalog.changed([], []))
  assert(!catalog.changed(["flambo", "terminal"], ["terminal", "flambo"]))
  assert(catalog.changed(["flambo"], []))

  assert.throws(() => parsePermissionName("files"), /does not know/)
  assert.throws(() => catalog.resolve("all", ["unknown"]), /unknown value/)
  assert.throws(() => catalog.resolve("appearance", ["flambo"]), /unknown value/)
  assert.throws(() => catalog.resolve("services", ["   "]), /unknown value/)
  assert.throws(() => catalog.resolve("network", ["api.example.com"]), /unknown value/)
  assert.throws(() => catalog.resolve("storage", ["all:Documents"]), /unknown value/)
  assert.throws(() => catalog.resolve("storage", ["all,read:Documents"]), /unknown value/)
  assert.throws(() => catalog.declarations({ all: ["unknown"] }), /unknown value/)
  assert.throws(() => catalog.stored({ all: true }), /unresolved shorthand/)
  assert.throws(() => new PermissionCatalog({} as never), /needs a definition/)
  assert.throws(() => new PermissionCatalog({
      all: {
          default: ["unknown"]
      },
      services: catalog.definition("services"),
      programs: catalog.definition("programs"),
      network: catalog.definition("network"),
      storage: catalog.definition("storage"),
      uploads: catalog.definition("uploads"),
      appearance: catalog.definition("appearance"),
      desktopPreferences: catalog.definition("desktopPreferences"),
      desktopConnection: catalog.definition("desktopConnection"),
      authentication: catalog.definition("authentication")
  } as never), /invalid default/)

  assert.deepEqual(permissionCatalog.resolve("all", true), [])
  assert.deepEqual(permissionCatalog.declarations({ all: true }), { all: [] })
  assert.deepEqual(permissionCatalog.declarations({ programs: true }), { programs: [] })
  assert(permissionCatalog.granted([]))
  assert(!permissionCatalog.granted(null))
  assert.throws(() => permissionCatalog.definition("files" as never), /does not know/)
}, 120_000)
