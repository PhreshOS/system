import assert from "node:assert/strict"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import Readiness from "../source/libs/readiness/main.tsx"
import ReadinessState from "../source/libs/readiness/state.ts"

const startup = ReadinessState.start(["connection", "session", "wallpaper"])

assert.deepEqual(startup.pending, ["connection", "session", "wallpaper"])
assert.equal(startup.sealed, false)

const connected = startup.ready("connection")
const extended = connected.require("programs")
const session = extended.ready("session")
const wallpaper = session.ready("wallpaper")
const complete = wallpaper.ready("programs")

assert.deepEqual(connected.pending, ["session", "wallpaper"])
assert.deepEqual(extended.pending, ["session", "wallpaper", "programs"])
assert.deepEqual(complete.pending, [])
assert.equal(complete.sealed, true)
assert.equal(complete.ready("programs"), complete)

assert.throws(() => startup.ready("unknown"), /does not know/)
assert.throws(() => startup.require("session"), /already knows/)
assert.throws(() => complete.require("late"), /already complete/)
assert.throws(() => ReadinessState.start(["connection", "connection"]), /already knows/)
assert.throws(() => ReadinessState.start([""]), /must have a name/)

const pendingMarkup = renderToStaticMarkup(createElement(Readiness, { requirements: ["connection"] },
    createElement(Readiness.Pending, null, createElement("span", null, "Loading")),
    createElement("p", null, "Prepared content")
))

const readyMarkup = renderToStaticMarkup(createElement(Readiness, { requirements: [] },
    createElement(Readiness.Pending, null, createElement("span", null, "Loading")),
    createElement("p", null, "Prepared content")
))

assert.match(pendingMarkup, /Loading/)
assert.match(pendingMarkup, /Prepared content/)
assert.doesNotMatch(readyMarkup, /Loading/)
assert.match(readyMarkup, /Prepared content/)
