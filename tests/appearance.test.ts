import assert from "node:assert/strict"
import Keyv from "keyv"
import { defaultAppearance, parseAppearance } from "@phreshos/core"
import AppearanceManager from "@server/core/appearance-manager"
import FileManager from "@libs/file-manager"
import UploadManager from "@server/core/upload-manager"
import { mkdtemp, rm, truncate, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "vitest"
import { randomUUID } from "node:crypto"
import { wallpaperSizeLimit } from "@shared/wallpaper"

test("appearance contract", async () => {
  assert.deepEqual(parseAppearance(defaultAppearance), defaultAppearance)
  assert.throws(() => parseAppearance({}))
  assert.deepEqual(parseAppearance({
    ...defaultAppearance,
    colors: { ...defaultAppearance.colors, extension: defaultAppearance.colors.light.primary }
  }), defaultAppearance)
  assert.throws(() => parseAppearance({ ...defaultAppearance, spacing: { light: 12, dark: 12 } }))
  assert.throws(() => parseAppearance({
    ...defaultAppearance,
    material: {
      ...defaultAppearance.material,
      dark: { ...defaultAppearance.material.dark, grain: 1.01 }
    }
  }))
  assert.throws(() => parseAppearance({
    ...defaultAppearance,
    transaction: { duration: 120 }
  }))

  const store = new Keyv()
  const directory = await mkdtemp(join(tmpdir(), "phresh-appearance-"))
  const uploads = new UploadManager(new FileManager(directory))
  const manager = await AppearanceManager.open(store, uploads)

  assert.deepEqual(manager.value, defaultAppearance)
  assert(Object.isFrozen(manager.value))
  assert.deepEqual(await store.get("appearance"), defaultAppearance)

  const legacyStore = new Keyv()
  const { overlay: _overlay, ...legacyTaskbar } = defaultAppearance.taskbar
  const legacyAppearance = {
    ...defaultAppearance,
    spacing: 15,
    taskbar: { ...legacyTaskbar, position: "top" as const }
  }
  await legacyStore.set("appearance", legacyAppearance)

  const migrated = await AppearanceManager.open(legacyStore, uploads)

  assert.deepEqual(migrated.value, {
    ...legacyAppearance,
    taskbar: { ...legacyAppearance.taskbar, overlay: false }
  })
  assert.deepEqual(await legacyStore.get("appearance"), migrated.value)

  const initial = manager.value
  assert.equal(await manager.update(defaultAppearance), initial)
  assert.equal(manager.value, initial)

  await manager.update({ colors: { dark: { danger: "#ff0000" } } })
  assert.equal(manager.value.colors.dark.danger, "#ff0000")
  assert.deepEqual(manager.value.colors.light, initial.colors.light)
  assert.deepEqual(manager.value.material, initial.material)

  for (const theme of ["light", "dark"] as const) {
    for (const role of ["background", "foreground", "primary", "secondary", "success", "warning", "danger", "info"] as const) {
      const color = "oklch(60% 0.2 260)"
      const colors = {
        ...manager.value.colors,
        [theme]: { ...manager.value.colors[theme], [role]: color }
      }

      await manager.update({ ...manager.value, colors })
      assert.equal(manager.value.colors[theme][role], color)
      assert.equal((await store.get("appearance")).colors[theme][role], color)
      assert(Object.isFrozen(manager.value.colors[theme]))

      const current = manager.value
      const invalidColors = {
        ...current.colors,
        [theme]: { ...current.colors[theme], [role]: "" }
      }

      await assert.rejects(manager.update({ ...current, colors: invalidColors }))
      assert.equal(manager.value, current)
      assert.deepEqual(await store.get("appearance"), current)
    }
  }

  const reopened = await AppearanceManager.open(store, uploads)
  assert.deepEqual(reopened.value, manager.value)

  const shadow = {
    light: { x: -3, y: 12, blur: 30, spread: 2, opacity: 0.25 },
    dark: { x: 2, y: 6, blur: 18, spread: -1, opacity: 0.12 }
  }
  await manager.update({ ...manager.value, shadow })
  assert.deepEqual(manager.value.shadow, shadow)
  assert.deepEqual((await store.get("appearance")).shadow, shadow)
  assert.deepEqual((await AppearanceManager.open(store, uploads)).value.shadow, shadow)

  for (const invalid of [{ ...shadow.light, blur: -1 }, { ...shadow.light, opacity: 1.1 }, { ...shadow.light, x: Infinity }]) {
    await assert.rejects(manager.update({ ...manager.value, shadow: { ...shadow, light: invalid } }))
    assert.deepEqual(manager.value.shadow, shadow)
  }

  const updated = {
    ...manager.value,
    transaction: { duration: 180, easing: [0.25, 0.1, 0.25, 1] as const }
  }

  await manager.update(updated)

  assert.deepEqual(manager.value, updated)
  assert.deepEqual(await store.get("appearance"), updated)
  assert.equal(await store.get("appearance:colors"), undefined)
  assert.equal(await store.get("appearance:theme"), undefined)

  const wallpaperFiles = await Promise.all(["png", "webm", "html"].map(extension =>
    uploads.write(extension, new Blob(["wallpaper"]).stream())))

  for (const file of wallpaperFiles) {
    await manager.update({
      ...manager.value,
      desktopWallpaper: { ...manager.value.desktopWallpaper, light: file }
    })
    assert.equal(manager.value.desktopWallpaper.light, file)
  }

  const unsupported = await uploads.write("txt", new Blob(["wallpaper"]).stream())
  await assert.rejects(manager.update({
    ...manager.value,
    desktopWallpaper: { ...manager.value.desktopWallpaper, light: unsupported }
  }), /image, video, or HTML/)

  const oversized = `${randomUUID()}.html`
  await writeFile(uploads.path(oversized), "")
  await truncate(uploads.path(oversized), wallpaperSizeLimit + 1)
  await assert.rejects(manager.update({
    ...manager.value,
    desktopWallpaper: { ...manager.value.desktopWallpaper, light: oversized }
  }), /50 MiB/)

  await rm(directory, { recursive: true, force: true })
}, 120_000)
