import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import FileArea from "../source/libs/file-area.ts"

const fixture = mkdtempSync(join(tmpdir(), "phreshos-storage-"))
const root = join(fixture, "configured")
const outside = join(fixture, "outside")

try {
    const storage = new FileArea(root)

    mkdirSync(join(root, "kept"), { recursive: true })
    mkdirSync(join(root, "nested"), { recursive: true })
    writeFileSync(join(root, "kept", "value.txt"), "kept")
    writeFileSync(join(root, "nested", "value.txt"), "removed")

    storage.clear(["nested"])

    assert.deepEqual(readdirSync(join(root, "nested")), [])
    assert.deepEqual(readdirSync(join(root, "kept")), ["value.txt"])
    assert.throws(() => storage.resolve(["..", "outside"]), /configured directory/)

    mkdirSync(outside, { recursive: true })
    writeFileSync(join(outside, "value.txt"), "outside")
    symlinkSync(outside, join(root, "escape"), "dir")

    assert.throws(() => storage.stat(["escape", "value.txt"]), /symbolic link/)
    assert.throws(() => storage.list(["escape"]), /symbolic link/)
    assert.throws(() => storage.stream(["escape", "value.txt"]), /symbolic link/)
    assert.throws(() => storage.delete(["escape", "value.txt"]), /symbolic link/)
    assert.throws(() => storage.clear(["escape"]), /symbolic link/)
    await assert.rejects(
        storage.write(["escape", "written.txt"], new Blob(["outside"]).stream()),
        /symbolic link/
    )
    assert.deepEqual(readdirSync(outside), ["value.txt"])
}
finally {
    rmSync(fixture, { recursive: true, force: true })
}
