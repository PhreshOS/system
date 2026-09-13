import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import FileArea, { FileSystem } from "@libs/file-area"
import AuthManager from "@server/core/link-manager/auth-manager/auth-manager"
import { test } from "vitest"

test("storage contract", async () => {
  const fixture = mkdtempSync(join(tmpdir(), "phreshos-storage-"))
  const root = join(fixture, "configured")
  const outside = join(fixture, "outside")

  try {
      const storage = new FileArea(root)
      const home = new FileSystem(resolve(fixture, "home"))
      const authManager = Object.assign(Object.create(AuthManager.prototype), {
          linkManager: { application: { home, storage: { path: root } } },
          $outbound: { async publish() {} }
      }) as AuthManager
      const systemStorage = (AuthManager.prototype as unknown as {
          storage(operation: unknown, values: unknown): Promise<unknown>
      }).storage

      assert.equal(await systemStorage.call(authManager, "path", []), home.path)
      assert.equal(await systemStorage.call(authManager, "path", ["..", "outside"]), outside)

      mkdirSync(join(root, "kept"), { recursive: true })
      mkdirSync(join(root, "nested"), { recursive: true })
      writeFileSync(join(root, "kept", "value.txt"), "kept")
      writeFileSync(join(root, "nested", "value.txt"), "removed")

      storage.clear(["nested"])

      assert.deepEqual(readdirSync(join(root, "nested")), [])
      assert.deepEqual(readdirSync(join(root, "kept")), ["value.txt"])

      storage.create(["created"])
      await storage.write(["created", "value.txt"], new Blob(["storage"]).stream(), undefined, false)
      await storage.append(["created", "value.txt"], new Blob([" file"]).stream())
      assert.equal(readFileSync(join(root, "created", "value.txt"), "utf8"), "storage file")
      assert.equal(await new Response(storage.stream(["created", "value.txt"], [8, 4])).text(), "file")
      assert.deepEqual(storage.list([], [true]), [
          { kind: "storage", path: ["created"] },
          { kind: "file", path: ["created", "value.txt"] },
          { kind: "storage", path: ["kept"] },
          { kind: "file", path: ["kept", "value.txt"] },
          { kind: "storage", path: ["nested"] }
      ])
      assert.ok(storage.space().capacity > 0)

      const changes = storage.watch(["created"])
      const changed = changes.next()
      await new Promise(resolve => setTimeout(resolve, 10))
      writeFileSync(join(root, "created", "watched.txt"), "changed")
      assert.match((await changed).value?.event ?? "", /^(change|rename)$/)
      await changes.return(undefined)
      assert.throws(() => storage.resolve(["..", "outside"]), /configured directory/)

      mkdirSync(outside, { recursive: true })
      writeFileSync(join(outside, "value.txt"), "outside")
      symlinkSync(outside, join(root, "escape"), "dir")
      symlinkSync(outside, join(home.path, "escape"), "dir")

      assert.equal(home.resolve(["escape", "value.txt"]), join(home.path, "escape", "value.txt"))
      assert.equal(home.stat(["escape", "value.txt"])?.kind, "file")

      assert.throws(() => storage.stat(["escape", "value.txt"]), /symbolic link/)
      assert.throws(() => storage.list(["escape"]), /symbolic link/)
      assert.throws(() => storage.stream(["escape", "value.txt"]), /symbolic link/)
      assert.throws(() => storage.delete(["escape", "value.txt"]), /symbolic link/)
      assert.throws(() => storage.clear(["escape"]), /symbolic link/)
      await assert.rejects(
          storage.write(["escape", "written.txt"], new Blob(["outside"]).stream()),
          /symbolic link/
      )
      assert.deepEqual(readdirSync(outside), ["value.txt"])
  }
  finally {
      rmSync(fixture, { recursive: true, force: true })
  }
}, 120_000)
