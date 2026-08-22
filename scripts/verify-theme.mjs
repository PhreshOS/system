import assert from "node:assert/strict"
import Keyv from "keyv"
import ThemeManager, { themeSchema } from "../source/server/core/theme-manager.ts"

const expected = {
  background: "#f5f4ee",
  foreground: "#183447",
  accent: "#4c9cff",
  spacing: 12,
  radius: 10,
  glass: {
    distortion: 70,
    blur: 4,
    saturation: 1.8,
    brightness: 1.06,
    opacity: 0.12
  },
  surface: {
    color: "#f5f4ee",
    grain: 0.1,
    animation: 0,
    backdrop: 0,
    opacity: 1
  }
}

assert.deepEqual(themeSchema.parse({}), expected)
assert.deepEqual(themeSchema.parse({ surface: { color: "black", grain: 0.9, animation: 16, backdrop: 24, opacity: 0 } }).surface, {
  color: "black",
  grain: 0.9,
  animation: 16,
  backdrop: 24,
  opacity: 0
})
assert.throws(() => themeSchema.parse({ surface: { grain: 1.01 } }))
assert.throws(() => themeSchema.parse({ surface: { animation: 17 } }))
assert.throws(() => themeSchema.parse({ surface: { backdrop: 25 } }))

const store = new Keyv()
const manager = await ThemeManager.open(store)

assert.deepEqual(manager.value, expected)
assert(Object.isFrozen(manager.value))

await manager.update({ ...expected, background: "black" })
assert.equal(manager.value.background, "black")
assert.equal((await store.get("appearance:theme")).background, "black")
