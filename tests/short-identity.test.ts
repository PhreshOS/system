import assert from "node:assert/strict"
import { test } from "vitest"
import shortIdentity from "@libs/short-identity"

test("short identities are ten characters people can type", () => {
  const identities = new Set(Array.from({ length: 10_000 }, shortIdentity))

  assert.equal(identities.size, 10_000)
  for (const identity of identities) assert.match(identity, /^[0-9abcdefghjkmnpqrstvwxyz]{10}$/)
})
