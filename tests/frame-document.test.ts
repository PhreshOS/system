import assert from "node:assert/strict"
import { colorScheme, frameTheme, themedFrameDocument } from "@server/view/http/program/frame-document"
import { test } from "vitest"

const page = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <title>Program</title>
</head>
<body><div id="root"></div></body>
</html>`

function frameRequest(query: string, destination = "iframe") {
  return new Request(`http://localhost/program/id/assets/${query}`, { headers: { "sec-fetch-dest": destination } })
}

test("reads the theme only from a frame document request", () => {
  assert.equal(frameTheme(frameRequest("?theme=dark")), "dark")
  assert.equal(frameTheme(frameRequest("?theme=light")), "light")
  assert.equal(frameTheme(frameRequest("?theme=sepia")), null)
  assert.equal(frameTheme(frameRequest("")), null)
  assert.equal(frameTheme(frameRequest("?theme=dark", "document")), null)
})

test("declares the theme at the start of the head, leaving every other byte as written", () => {
  const themed = colorScheme(page, "dark")
  assert.equal(themed, page.replace("<head>", `<head><meta name="color-scheme" content="dark">`))
})

test("finds the head where the document leaves its tags out, never before the doctype", () => {
  assert.equal(colorScheme(`<!DOCTYPE html><title>Program</title>`, "light"), `<!DOCTYPE html><meta name="color-scheme" content="light"><title>Program</title>`)
  assert.equal(colorScheme(`<!DOCTYPE html><html><body>Program</body></html>`, "light"), `<!DOCTYPE html><html><meta name="color-scheme" content="light"><body>Program</body></html>`)
  // A head in a comment is text, not the head.
  assert.equal(colorScheme(`<!-- <head> --><!DOCTYPE html><head></head>`, "dark"), `<!-- <head> --><!DOCTYPE html><head><meta name="color-scheme" content="dark"></head>`)
})

test("keeps a color scheme the document declares itself", () => {
  const declared = page.replace("<title>", `<meta name="Color-Scheme" content="light dark"><title>`)
  assert.equal(colorScheme(declared, "dark"), declared)
})

test("shapes only successful, uncompressed HTML responses", async () => {
  const html = (body: string, headers: Record<string, string> = {}) => new Response(body, { headers: { "content-type": "text/html; charset=utf-8", "content-length": String(body.length), ...headers } })

  const themed = await themedFrameDocument(html(page), "dark")
  assert.match(await themed.text(), /<meta name="color-scheme" content="dark">/)
  assert.equal(themed.headers.get("content-length"), null)

  const script = new Response("console.log(1)", { headers: { "content-type": "text/javascript" } })
  assert.equal(await themedFrameDocument(script, "dark"), script)

  const compressed = html(page, { "content-encoding": "gzip" })
  assert.equal(await themedFrameDocument(compressed, "dark"), compressed)

  const unthemed = html(page)
  assert.equal(await themedFrameDocument(unthemed, null), unthemed)
})
