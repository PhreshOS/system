export default function installWebEnvironment() {

    const blobData = new WeakMap()
    const bodyData = new WeakMap()

    function copyBytes(value) {

        const copy = new Uint8Array(value.byteLength)
        copy.set(value)
        return copy
    }

    function bytesFrom(value) {

        if (value instanceof Blob) return copyBytes(blobData.get(value))
        if (value instanceof ArrayBuffer) return copyBytes(new Uint8Array(value))
        if (ArrayBuffer.isView(value)) return copyBytes(new Uint8Array(value.buffer, value.byteOffset, value.byteLength))
        return new TextEncoder().encode(String(value))
    }

    function joinBytes(parts) {

        const chunks = parts.map(bytesFrom)
        const result = new Uint8Array(chunks.reduce((size, chunk) => size + chunk.byteLength, 0))
        let offset = 0

        for (const chunk of chunks) {

            result.set(chunk, offset)
            offset += chunk.byteLength
        }
        return result
    }

    function arrayBuffer(bytes) {

        return copyBytes(bytes).buffer
    }

    function mediaType(value) {

        const type = String(value ?? "").toLowerCase()
        return /[^\u0020-\u007e]/.test(type) ? "" : type
    }

    class Blob {

        constructor(parts = [], options = {}) {

            if (parts === null || typeof parts[Symbol.iterator] !== "function") throw new TypeError("Blob parts must be iterable")
            blobData.set(this, joinBytes([...parts]))
            this.type = mediaType(options.type)
        }
        get size() { return blobData.get(this).byteLength }
        async arrayBuffer() { return arrayBuffer(blobData.get(this)) }
        async bytes() { return copyBytes(blobData.get(this)) }
        async text() { return new TextDecoder().decode(blobData.get(this)) }
        slice(start = 0, end = this.size, type = "") {

            const size = this.size
            const first = start < 0 ? Math.max(size + Number(start), 0) : Math.min(Number(start), size)
            const last = end < 0 ? Math.max(size + Number(end), 0) : Math.min(Number(end), size)
            return new Blob([blobData.get(this).slice(first, Math.max(first, last))], { type })
        }
        stream() {

            const bytes = copyBytes(blobData.get(this))
            return new ReadableStream({
                start(controller) {

                    controller.enqueue(bytes)
                    controller.close()
                }
            })
        }
        get [Symbol.toStringTag]() { return "Blob" }
    }

    class File extends Blob {

        constructor(parts, name, options = {}) {

            super(parts, options)
            this.name = String(name)
            this.lastModified = options.lastModified === undefined ? Date.now() : Number(options.lastModified)
            this.webkitRelativePath = ""
        }
        get [Symbol.toStringTag]() { return "File" }
    }

    function headerName(value) {

        const name = String(value).toLowerCase()
        if (!name || !/^[!#$%&'*+\-.^_`|~0-9a-z]+$/.test(name)) throw new TypeError(`Invalid header name: ${value}`)
        return name
    }

    function headerValue(value) {

        const normalized = String(value).trim()
        if (/[\0\r\n]/.test(normalized)) throw new TypeError("Invalid header value")
        return normalized
    }

    class Headers {

        #values = new Map()
        constructor(init = undefined) {

            if (init === undefined) return
            if (init instanceof Headers || typeof init[Symbol.iterator] === "function") {

                for (const entry of init) {

                    if (entry === null || typeof entry[Symbol.iterator] !== "function") throw new TypeError("A header entry must be iterable")
                    const pair = [...entry]
                    if (pair.length !== 2) throw new TypeError("A header entry must contain a name and value")
                    this.append(pair[0], pair[1])
                }
                return
            }
            if (init === null || typeof init !== "object") throw new TypeError("Headers must be initialized with an object or iterable")
            for (const [name, value] of Object.entries(init)) this.append(name, value)
        }
        append(name, value) {

            const key = headerName(name)
            const next = headerValue(value)
            const current = this.#values.get(key)
            this.#values.set(key, current === undefined ? next : `${current}, ${next}`)
        }
        delete(name) { this.#values.delete(headerName(name)) }
        get(name) { return this.#values.get(headerName(name)) ?? null }
        has(name) { return this.#values.has(headerName(name)) }
        set(name, value) { this.#values.set(headerName(name), headerValue(value)) }
        *entries() { yield* [...this.#values.entries()].sort(([left], [right]) => left.localeCompare(right)) }
        *keys() { for (const [name] of this.entries()) yield name }
        *values() { for (const [, value] of this.entries()) yield value }
        forEach(callback, thisArg = undefined) {

            for (const [name, value] of this.entries()) callback.call(thisArg, value, name, this)
        }
        [Symbol.iterator]() { return this.entries() }
        get [Symbol.toStringTag]() { return "Headers" }
    }

    function streamOf(bytes) {

        return new ReadableStream({
            start(controller) {

                controller.enqueue(copyBytes(bytes))
                controller.close()
            }
        })
    }

    function bodyFrom(value) {

        if (value === null || value === undefined) return { stream: null, type: "" }
        if (value instanceof ReadableStream) return { stream: value, type: "" }
        if (value instanceof Blob) return { stream: value.stream(), type: value.type }
        if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return { stream: streamOf(bytesFrom(value)), type: "" }
        return { stream: streamOf(new TextEncoder().encode(String(value))), type: "text/plain;charset=UTF-8" }
    }

    function setBody(target, value) {

        const body = bodyFrom(value)
        bodyData.set(target, { stream: body.stream, used: false })
        return body.type
    }

    function bodyState(target) { return bodyData.get(target) }

    async function consume(target) {

        const state = bodyState(target)
        if (state.used) throw new TypeError("Body has already been consumed")
        state.used = true
        if (state.stream === null) return new Uint8Array()

        const reader = state.stream.getReader()
        const chunks = []
        let size = 0

        while (true) {

            const result = await reader.read()
            if (result.done) break
            const chunk = bytesFrom(result.value)
            chunks.push(chunk)
            size += chunk.byteLength
        }

        const bytes = new Uint8Array(size)
        let offset = 0
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
        return bytes
    }

    function cloneBody(target) {

        const state = bodyState(target)
        if (state.used) throw new TypeError("Body has already been consumed")
        if (state.stream === null) return null
        const [current, clone] = state.stream.tee()
        state.stream = current
        return clone
    }

    const Body = Base => class extends Base {

        get body() { return bodyState(this).stream }
        get bodyUsed() { return bodyState(this).used }
        async arrayBuffer() { return arrayBuffer(await consume(this)) }
        async bytes() { return consume(this) }
        async text() { return new TextDecoder().decode(await consume(this)) }
        async json() { return JSON.parse(await this.text()) }
        async blob() { return new Blob([await consume(this)], { type: this.headers.get("content-type") ?? "" }) }
    }

    function method(value) {

        const normalized = String(value).toUpperCase()
        if (!/^[!#$%&'*+\-.^_`|~0-9A-Z]+$/.test(normalized)) throw new TypeError(`Invalid request method: ${value}`)
        return normalized
    }

    class Request extends Body(Object) {

        constructor(input, init = {}) {

            super()
            const source = input instanceof Request ? input : null
            this.url = source ? source.url : new URL(input).href
            this.method = method(init.method ?? source?.method ?? "GET")
            this.headers = new Headers(init.headers ?? source?.headers)
            this.redirect = init.redirect ?? source?.redirect ?? "follow"
            this.signal = init.signal ?? source?.signal ?? new AbortController().signal
            this.cache = init.cache ?? source?.cache ?? "default"
            this.credentials = init.credentials ?? source?.credentials ?? "same-origin"
            this.destination = source?.destination ?? ""
            this.integrity = init.integrity ?? source?.integrity ?? ""
            this.keepalive = Boolean(init.keepalive ?? source?.keepalive ?? false)
            this.mode = init.mode ?? source?.mode ?? "cors"
            this.referrer = init.referrer ?? source?.referrer ?? "about:client"
            this.referrerPolicy = init.referrerPolicy ?? source?.referrerPolicy ?? ""
            this.duplex = init.duplex ?? source?.duplex ?? "half"

            const hasBody = Object.prototype.hasOwnProperty.call(init, "body")
            const body = hasBody ? init.body : source ? cloneBody(source) : null
            if ((this.method === "GET" || this.method === "HEAD") && body !== null && body !== undefined) throw new TypeError(`${this.method} requests cannot have a body`)
            const type = setBody(this, body)
            if (type && !this.headers.has("content-type")) this.headers.set("content-type", type)
        }
        clone() { return new Request(this) }
        get [Symbol.toStringTag]() { return "Request" }
    }

    class Response extends Body(Object) {

        constructor(body = null, init = {}) {

            super()
            const status = init.status === undefined ? 200 : Number(init.status)
            if (!Number.isInteger(status) || status < 200 || status > 599) throw new RangeError("Response status must be between 200 and 599")
            this.status = status
            this.statusText = String(init.statusText ?? "")
            this.headers = new Headers(init.headers)
            this.type = "default"
            this.url = ""
            this.redirected = false
            const contentType = setBody(this, body)
            if (contentType && !this.headers.has("content-type")) this.headers.set("content-type", contentType)
        }
        get ok() { return this.status >= 200 && this.status <= 299 }
        clone() {

            const response = new Response(cloneBody(this), { headers: this.headers, status: this.status, statusText: this.statusText })
            response.type = this.type
            response.url = this.url
            response.redirected = this.redirected
            return response
        }
        static json(value, init = {}) {

            const headers = new Headers(init.headers)
            if (!headers.has("content-type")) headers.set("content-type", "application/json")
            return new Response(JSON.stringify(value), { ...init, headers })
        }
        static redirect(url, status = 302) {

            if (![301, 302, 303, 307, 308].includes(status)) throw new RangeError("Invalid redirect status")
            return new Response(null, { headers: { location: new URL(url).href }, status })
        }
        get [Symbol.toStringTag]() { return "Response" }
    }

    Object.assign(globalThis, { Blob, File, Headers, Request, Response })
}
