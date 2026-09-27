import assert from "node:assert/strict"
import { renderToStaticMarkup } from "react-dom/server"
import ProgramFrame from "@client/view/components/program-frame"
import type Process from "@client/core/link-manager/auth-manager/process-manager/process"
import type ClientState from "@client/core/link-manager/auth-manager/process-manager/client-state"
import { test } from "vitest"

test("program frame contract", async () => {
  const record = { identity: "process", program: "program" } as Process
  const client = { sandbox: true, window: {} } as ClientState
  const common = {
      record,
      assetId: "00000000-0000-4000-8000-000000000000",
      client,
      title: "Program",
      door: "/program",
      access: "available" as const,
      onFrame() {},
      onLoad() {}
  }

  const dark = renderToStaticMarkup(<ProgramFrame {...common} theme="dark" />)
  const light = renderToStaticMarkup(<ProgramFrame {...common} theme="light" />)

  const trusted = renderToStaticMarkup(<ProgramFrame {...common} client={{ ...client, sandbox: false } as ClientState} theme="light" />)

  // The frame asks for its document in the Desktop's theme; the frame element itself is not styled.
  assert.match(dark, /src="\/program\/00000000-0000-4000-8000-000000000000\/assets\/\?theme=dark"/)
  assert.match(light, /src="\/program\/00000000-0000-4000-8000-000000000000\/assets\/\?theme=light"/)
  assert.doesNotMatch(dark, /color-scheme/)
  assert.match(dark, /sandbox="allow-scripts allow-forms"/)
  assert.doesNotMatch(trusted, /sandbox=/)
}, 120_000)
