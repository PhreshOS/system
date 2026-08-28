import assert from "node:assert/strict"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { resolve } from "node:path"
import FileManager from "@libs/file-manager"
import UploadManager from "@server/core/upload-manager"
import uploadView from "@server/view/uploads"
import type Application from "@server/core/application"
import { Hono } from "hono"

const directory = await mkdtemp(resolve(".verify-uploads-"))
const uploads = new UploadManager(new FileManager(directory))

try {
    const file = await uploads.write("txt", new Blob(["hello uploads"]).stream())
    const upload = uploads.stat(file)

    assert(upload)
    assert.equal(upload.file, file)
    assert.equal(upload.type, "text/plain")
    assert.equal(upload.size, 13)
    assert.equal(await readFile(uploads.path(file), "utf8"), "hello uploads")
    assert.equal(uploads.stat("00000000-0000-0000-0000-000000000000.txt"), null)
    assert.throws(() => uploads.stat("../outside.txt"), /not an upload file/)

    const view = new Hono()

    const application = {
        uploads,
        linkManager: {
            authManager: {
                verify(value: unknown) {
                    if (value !== "allowed") throw new Error("Unauthorized")
                },
                async upload(authorization: unknown, content: ReadableStream<Uint8Array> | null, extension: string, signal?: AbortSignal) {
                    this.verify(authorization)
                    const written = await uploads.write(extension, content, signal)
                    const upload = uploads.stat(written)
                    assert(upload)
                    return upload
                }
            }
        }
    } as unknown as Application

    view.route("/uploads", uploadView(application))
    const response = await view.request("http://system/uploads", {
        method: "POST",
        headers: {
            authorization: "allowed",
            "content-disposition": "attachment; filename=value.json",
            "content-type": "application/json"
        },
        body: JSON.stringify({ ready: true })
    })
    assert.equal(response.status, 200)
    const created = await response.json()

    assert.equal(created.type, "application/json")
    const described = await view.request(`http://system/uploads/${created.file}/stat`)
    const downloaded = await view.request(`http://system/uploads/${created.file}`)

    assert.equal(described.status, 200)
    assert.equal(downloaded.status, 200)
    assert.deepEqual(await described.json(), created)
    assert.deepEqual(JSON.parse(await downloaded.text()), { ready: true })
    assert.equal((await view.request("http://system/uploads/not-a-key")).status, 400)
    assert.equal((await view.request("http://system/uploads/00000000-0000-0000-0000-000000000000.txt")).status, 404)
} finally {
    await rm(directory, { recursive: true, force: true })
}

console.log("uploads verified")
