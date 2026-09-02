import assert from "node:assert/strict"
import { renderToStaticMarkup } from "react-dom/server"
import ProgramFrame from "@client/view/components/program-frame"
import type Process from "@client/core/link-manager/auth-manager/process-manager/process"
import type ClientState from "@client/core/link-manager/auth-manager/process-manager/client-state"

const record = { identity: "process", program: "program" } as Process
const client = { sameOrigin: false, window: { location: "/" } } as ClientState
const common = {
    record,
    client,
    title: "Program",
    door: "/program",
    access: "available" as const,
    onFrame() {},
    onLoad() {}
}

const dark = renderToStaticMarkup(<ProgramFrame {...common} theme="dark" />)
const light = renderToStaticMarkup(<ProgramFrame {...common} theme="light" />)

client.sameOrigin = true

const fullAccess = renderToStaticMarkup(<ProgramFrame {...common} theme="light" />)

assert.match(dark, /style="color-scheme:dark"/)
assert.match(light, /style="color-scheme:light"/)
assert.match(dark, /sandbox="allow-scripts allow-forms"/)
assert.match(fullAccess, /sandbox="allow-scripts allow-forms allow-same-origin"/)
assert.match(fullAccess, /src="\/program\/program\/assets\/"/)
