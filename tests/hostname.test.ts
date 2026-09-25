import { strict as assert } from "node:assert"
import { defaultHostname, environmentHostname } from "@server/view/configuration"
import { test } from "vitest"

test("listener hostname contract", () => {
  assert.equal(defaultHostname(), "localhost")
  assert.equal(environmentHostname("phreshos", {}), undefined)
  assert.equal(environmentHostname("phreshos", { PHRESHOS_HOST: "0.0.0.0" }), "0.0.0.0")
  assert.equal(environmentHostname("phreshos", { PHRESHOS_HOST: "::" }), "::")
  assert.equal(environmentHostname("phreshos", { PHRESHOS_HOST: "desktop.internal" }), "desktop.internal")

  for (const value of ["", " ", " localhost", "localhost ", "two hosts"]) {
    assert.throws(
      () => environmentHostname("phreshos", { PHRESHOS_HOST: value }),
      /PHRESHOS_HOST must contain one hostname or IP address/
    )
  }
})
