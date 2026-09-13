import { expect, test } from "vitest"
import { parseProcessSnapshot, type ProgramSnapshot } from "@phreshos/core"
import { sdkProcess, type SdkProcessSource } from "@client/view/components/desktop-host/sdk-records"

test("Desktop preserves Endpoint service roles in SDK snapshots", () => {
  const program: ProgramSnapshot = {
    identity: "example", reference: "program-reference", assetId: "program-assets",
    name: "Example", version: null, description: null, hasAgent: false,
    server: { start: true, service: false }, client: null
  }
  for (const server of [null, { service: false }, { service: true }]) {
    for (const client of [null, { service: false }, { service: true }]) {
      const source: SdkProcessSource = {
        identity: "process-identity", reference: "process-reference", program: program.identity,
        name: null, options: { language: "en" }, startedAt: new Date(0), server, client
      }
      const snapshot = parseProcessSnapshot(sdkProcess(source, program))
      expect(snapshot.server).toEqual(server)
      expect(snapshot.client).toEqual(client)
    }
  }
})
