import { parse } from "parse5"

type Theme = "light" | "dark"

/**
 * The Desktop theme a Program frame document is requested with. The Desktop
 * names it in the frame's address when it creates the frame; only the frame's
 * own document is shaped, never another HTML asset.
 */
export function frameTheme(request: Request): Theme | null {

    if (request.headers.get("sec-fetch-dest") !== "iframe") return null

    const theme = new URL(request.url).searchParams.get("theme")

    return theme === "light" || theme === "dark" ? theme : null
}

/**
 * Serves a Program frame document in the Desktop's theme from its first byte.
 * A frame whose document's color scheme differs from the Desktop's is painted
 * opaque by the browser, so the document declares the Desktop's theme before
 * any of its code runs. A document that declares its own color scheme keeps it.
 */
export async function themedFrameDocument(response: Response, theme: Theme | null) {

    if (theme === null || !response.ok || response.headers.has("content-encoding")) return response

    if (!response.headers.get("content-type")?.toLowerCase().startsWith("text/html")) return response

    const html = colorScheme(await response.text(), theme)

    const headers = new Headers(response.headers)

    headers.delete("content-length")

    headers.delete("etag")

    return new Response(html, { status: response.status, statusText: response.statusText, headers })
}

/** Adds `<meta name="color-scheme">` at the start of the document's head, leaving every other byte as written. */
export function colorScheme(html: string, theme: Theme) {

    const document = parse(html, { sourceCodeLocationInfo: true })

    const root = document.childNodes.find(node => node.nodeName === "html")

    const head = root && "childNodes" in root ? root.childNodes.find(node => node.nodeName === "head") : undefined

    if (!head || !("childNodes" in head)) return html

    const declared = head.childNodes.some(node => node.nodeName === "meta" && "attrs" in node
        && node.attrs.some(attribute => attribute.name === "name" && attribute.value.trim().toLowerCase() === "color-scheme"))

    if (declared) return html

    const meta = `<meta name="color-scheme" content="${theme}">`

    // After the head's start tag, or where the head begins when the document leaves its tags out:
    // after the html start tag, or after the doctype, never before it.
    const doctype = document.childNodes.find(node => node.nodeName === "#documentType")

    const offset = startTagEnd(head) ?? startTagEnd(root) ?? doctype?.sourceCodeLocation?.endOffset ?? 0

    return html.slice(0, offset) + meta + html.slice(offset)
}

/** Where a written start tag ends; nothing when the parser implied the element. */
function startTagEnd(node: object | undefined) {

    const location = node && "sourceCodeLocation" in node ? node.sourceCodeLocation : undefined

    return location && typeof location === "object" && "startTag" in location
        ? (location.startTag as { endOffset: number } | undefined)?.endOffset
        : undefined
}
