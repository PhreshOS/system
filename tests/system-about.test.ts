import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "vitest"
import Application from "@server/core/application"
import { name, release, version } from "@/source/identity"

test("the System says what it is from its identity, and when it started", async () => {
    const home = await mkdtemp(join(tmpdir(), "phreshos-about-"))
    try {
        const before = Date.now()
        const application = await Application.initialize(home, join(home, "icon.png"))
        const about = application.system.about()

        assert.deepEqual(about, { name, version, release, startedAt: about.startedAt })
        assert(Object.isFrozen(about))
        // It started while it was being initialized, and stays the same for every reader.
        assert(about.startedAt.getTime() >= before && about.startedAt.getTime() <= Date.now())
        assert.equal(application.system.about().startedAt.getTime(), about.startedAt.getTime())
    }
    finally { await rm(home, { recursive: true, force: true }) }
}, 60_000)
