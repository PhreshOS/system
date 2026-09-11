import assert from "node:assert/strict"
import Keyv from "keyv"
import { defaultAppearance } from "@phreshos/core"
import AppearanceManager, { appearanceSchema } from "@server/core/appearance-manager"
import FileManager from "@libs/file-manager"
import UploadManager from "@server/core/upload-manager"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

assert.deepEqual(appearanceSchema.parse(defaultAppearance), defaultAppearance)
assert.throws(() => appearanceSchema.parse({}))
assert.throws(() => appearanceSchema.parse({
  ...defaultAppearance,
  colors: { ...defaultAppearance.colors, accent: defaultAppearance.colors.primary }
}))
assert.throws(() => appearanceSchema.parse({ ...defaultAppearance, spacing: { light: 12, dark: 12 } }))
assert.throws(() => appearanceSchema.parse({
  ...defaultAppearance,
  material: {
    ...defaultAppearance.material,
    dark: { ...defaultAppearance.material.dark, grain: 1.01 }
  }
}))

const store = new Keyv()
const directory = await mkdtemp(join(tmpdir(), "phresh-appearance-"))
const manager = await AppearanceManager.open(store, new UploadManager(new FileManager(directory)))

assert.deepEqual(manager.value, defaultAppearance)
assert(Object.isFrozen(manager.value))

for (const role of ["background", "foreground", "primary", "secondary", "success", "warning", "danger", "info"] as const) {

  assert.deepEqual((await store.get("appearance:colors"))[role], defaultAppearance.colors[role])
  const color = { light: "oklch(60% 0.2 260)", dark: "var(--custom-color)" }
  await manager.update({ ...manager.value, colors: { ...manager.value.colors, [role]: color } })
  assert.deepEqual(manager.value.colors[role], color)
  assert.deepEqual((await store.get("appearance:colors"))[role], color)
  assert(Object.isFrozen(manager.value.colors[role]))

  const current = manager.value
  for (const invalid of [undefined, { light: "red" }, { light: "red", dark: "" }]) {

    await assert.rejects(manager.update({ ...current, colors: { ...current.colors, [role]: invalid } }))
    assert.equal(manager.value, current)
    assert.deepEqual((await store.get("appearance:colors"))[role], color)
  }
}

const reopened = await AppearanceManager.open(store, new UploadManager(new FileManager(directory)))
assert.deepEqual(reopened.value, manager.value)

const shadow = {
  light: { x: -3, y: 12, blur: 30, spread: 2, opacity: 0.25 },
  dark: { x: 2, y: 6, blur: 18, spread: -1, opacity: 0.12 }
}
await manager.update({ ...manager.value, shadow })
assert.deepEqual(manager.value.shadow, shadow)
assert.deepEqual(await store.get("appearance:shadow"), shadow)
assert.deepEqual((await AppearanceManager.open(store, new UploadManager(new FileManager(directory)))).value.shadow, shadow)
for (const invalid of [{ ...shadow.light, blur: -1 }, { ...shadow.light, opacity: 1.1 }, { ...shadow.light, x: Infinity }]) {

  await assert.rejects(manager.update({ ...manager.value, shadow: { ...shadow, light: invalid } }))
  assert.deepEqual(manager.value.shadow, shadow)
}

const updated = {
  ...defaultAppearance,
  colors: { ...defaultAppearance.colors, background: { light: "white", dark: "black" } }
}

await manager.update(updated)

assert.deepEqual(manager.value.colors.background, updated.colors.background)
assert.deepEqual((await store.get("appearance:colors")).background, updated.colors.background)
assert.equal(await store.get("appearance:theme"), undefined)

await rm(directory, { recursive: true, force: true })
