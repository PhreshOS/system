import assert from "node:assert/strict"
import Keyv from "keyv"
import ThemeManager, { themeSchema } from "../source/server/core/theme-manager.ts"

const expected = {
  background: "#fffff5",
  foreground: "#183447",
  accent: "#4c9cff",
  spacing: 12,
  radius: 10,
  surface: {
    grain: 0,
    grainAmount: 0,
    grainAnimation: 0,
    backdrop: 0,
    opacity: 1,
    distortion: 0,
    waves: 0,
    ripples: 0,
    saturation: 1,
    brightness: 1
  }
}

assert.deepEqual(themeSchema.parse({}), expected)
const configured = themeSchema.parse({
  background: "black",
  surface: {
    grain: 0.9,
    grainAmount: 0.5,
    grainAnimation: 16,
    backdrop: 24,
    opacity: 0,
    distortion: 140,
    waves: 40,
    ripples: 40,
    saturation: 2.6,
    brightness: 1.12
  }
})
assert.equal(configured.background, "black")
assert.deepEqual(configured.surface, {
  grain: 0.9,
  grainAmount: 0.5,
  grainAnimation: 16,
  backdrop: 24,
  opacity: 0,
  distortion: 140,
  waves: 40,
  ripples: 40,
  saturation: 2.6,
  brightness: 1.12
})
assert.throws(() => themeSchema.parse({ surface: { color: "black" } }))
assert.throws(() => themeSchema.parse({ glass: {} }))
assert.throws(() => themeSchema.parse({ surface: { grain: 1.01 } }))
assert.throws(() => themeSchema.parse({ surface: { grainAmount: -0.01 } }))
assert.throws(() => themeSchema.parse({ surface: { animation: 1 } }))
assert.throws(() => themeSchema.parse({ surface: { grainAnimation: 17 } }))
assert.throws(() => themeSchema.parse({ surface: { backdrop: 25 } }))
assert.throws(() => themeSchema.parse({ surface: { distortion: 141 } }))
assert.throws(() => themeSchema.parse({ surface: { waves: 41 } }))
assert.throws(() => themeSchema.parse({ surface: { ripples: 41 } }))
assert.throws(() => themeSchema.parse({ surface: { saturation: 0.99 } }))
assert.throws(() => themeSchema.parse({ surface: { brightness: 1.13 } }))

const store = new Keyv()
const manager = await ThemeManager.open(store)

assert.deepEqual(manager.value, expected)
assert(Object.isFrozen(manager.value))

await manager.update({ ...expected, background: "black" })
assert.equal(manager.value.background, "black")
assert.equal((await store.get("appearance:theme")).background, "black")
