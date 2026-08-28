import assert from "node:assert/strict"
import Keyv from "keyv"
import { standardAppearance } from "@phreshos/core"
import AppearanceManager, { appearanceSchema } from "@server/core/appearance-manager"
import FileManager from "@libs/file-manager"
import UploadManager from "@server/core/upload-manager"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

assert.deepEqual(appearanceSchema.parse(standardAppearance), standardAppearance)
assert.throws(() => appearanceSchema.parse({}))
assert.throws(() => appearanceSchema.parse({ ...standardAppearance, spacing: { light: 12, dark: 12 } }))
assert.throws(() => appearanceSchema.parse({
  ...standardAppearance,
  surface: {
    ...standardAppearance.surface,
    dark: { ...standardAppearance.surface.dark, grain: 1.01 }
  }
}))

const store = new Keyv()
const directory = await mkdtemp(join(tmpdir(), "phresh-appearance-"))
const manager = await AppearanceManager.open(store, new UploadManager(new FileManager(directory)))

assert.deepEqual(manager.value, standardAppearance)
assert(Object.isFrozen(manager.value))

const updated = {
  ...standardAppearance,
  background: { light: "white", dark: "black" }
}

await manager.update(updated)

assert.deepEqual(manager.value.background, updated.background)
assert.deepEqual(await store.get("appearance:background"), updated.background)
assert.equal(await store.get("appearance:theme"), undefined)

await rm(directory, { recursive: true, force: true })
