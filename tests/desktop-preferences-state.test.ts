import assert from "node:assert/strict"
import { test } from "vitest"
import DesktopPreferencesState from "@client/core/link-manager/desktop-preferences-state"

const light = { theme: "light", animations: true, scale: 1 } as const
const dark = { theme: "dark", animations: true, scale: 1 } as const

test("a change settles once every Program told of it shows it", async () => {

    const state = new DesktopPreferencesState(light)
    state.tunnel.subscribe("change", () => { state.telling("settings") })

    let settled = false
    const change = state.update(dark).then(() => { settled = true })

    await new Promise(resolve => setTimeout(resolve, 20))
    assert.equal(settled, false)

    // The same preferences again wait for the same showing.
    assert.equal(state.update(dark), state.update(dark))

    state.shown("settings")
    await change
    assert.equal(settled, true)
})

test("a Program that never says it shows a change is not waited for past its time", async () => {

    const state = new DesktopPreferencesState(light)
    state.tunnel.subscribe("change", () => { state.telling("older-program") })

    const started = Date.now()
    await state.update(dark)
    const waited = Date.now() - started

    assert.ok(waited >= 140 && waited < 400, `waited ${waited} ms`)
})
