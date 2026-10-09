import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import sharp from "sharp"
import { test } from "vitest"
import { systemFiles } from "./system-files"
import Application from "@server/core/application"

test("the System renders its own icon at each standard size, and only those", async () => {
    const home = await mkdtemp(join(tmpdir(), "phreshos-icon-"))
    const application = await Application.initialize(home, { system: resolve("assets/logo.png"), defaultProgram: resolve("assets/default-icon.png") }, systemFiles)
    try {
        for (const [size, length] of [["small", 32], ["medium", 64], ["large", 128]] as const) {
            const metadata = await sharp(Buffer.from(await application.system.icon(size))).metadata()
            assert.equal(metadata.format, "png")
            assert.equal(metadata.width, length)
            assert.equal(metadata.height, length)
        }

        assert.equal((await sharp(Buffer.from(await application.system.icon())).metadata()).width, 64)
        await assert.rejects(application.system.icon("huge"), /small, medium, or large/)
    }
    finally {
        await application.store.disconnect()
        await rm(home, { recursive: true, force: true })
    }
}, 60_000)
