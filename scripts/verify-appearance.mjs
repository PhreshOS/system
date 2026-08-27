import assert from "node:assert/strict"
import Keyv from "keyv"
import { standardAppearance } from "@phreshos/core"
import AppearanceManager, { appearanceSchema } from "../source/server/core/appearance-manager.ts"

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
const manager = await AppearanceManager.open(store, { describe() {} })

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
