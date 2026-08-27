import { type Dispatch, type SetStateAction, useLayoutEffect, useMemo, useRef } from "react"

export type ProgramAccess = "checking" | "available" | "blocked"

const programAccessRequest = "program-access-request"

const programAccessMessage = "program-access"

const timeout = 10_000

/**
 * Exercise the Program asset door from the same opaque origin as a real
 * Program. A normal desktop fetch would be same-origin and would therefore
 * prove nothing about the boundary that Program frames cross.
 */
export default function ({ door, setAccess }: ProgramAccessProbeProps) {

    const frame = useRef<HTMLIFrameElement>(null)

    const source = useMemo(function () {

        const url = new URL(`${door}/ping`, window.location.href).href

        return `<!doctype html><meta charset="utf-8"><script>
let requested = false;
let result;
function report() {

    if (requested && typeof result === "boolean") parent.postMessage([${JSON.stringify(programAccessMessage)}, result], "*");
}
addEventListener("message", event => {

    if (event.data !== ${JSON.stringify(programAccessRequest)}) return;
    requested = true;
    report();
});
fetch(${JSON.stringify(url)}, { cache: "no-store" })
    .then(response => { result = response.ok; report(); })
    .catch(() => { result = false; report(); });
</script>`

    }, [door])

    useLayoutEffect(function () {

        const timer = window.setTimeout(() => setAccess("blocked"), timeout)

        function receive(event: MessageEvent) {

            if (event.source !== frame.current?.contentWindow) return

            if (!Array.isArray(event.data) || event.data[0] !== programAccessMessage || typeof event.data[1] !== "boolean") return

            window.clearTimeout(timer)

            setAccess(event.data[1] ? "available" : "blocked")
        }

        window.addEventListener("message", receive)

        return function () {

            window.clearTimeout(timer)

            window.removeEventListener("message", receive)
        }

    }, [setAccess])

    return <iframe

        ref={frame}

        srcDoc={source}

        title="Program asset compatibility check"

        sandbox="allow-scripts"

        onLoad={event => event.currentTarget.contentWindow?.postMessage(programAccessRequest, "*")}

        hidden

    />
}

interface ProgramAccessProbeProps {

    door: string

    setAccess: Dispatch<SetStateAction<ProgramAccess>>
}

export const blockedProgramDocument = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Program unavailable</title>
<style>
    :root { color-scheme: light; font-family: system-ui, sans-serif; color: #233548; background: #eef8ff; }
    * { box-sizing: border-box; }
    body { min-height: 100vh; margin: 0; display: grid; place-items: center; padding: 2rem; background: radial-gradient(circle at top left, #ffffff 0, #eef8ff 48%, #dff4ff 100%); }
    main { width: min(34rem, 100%); padding: 1.5rem; border: 1px solid rgba(89, 151, 191, .28); border-radius: 1.25rem; background: rgba(255, 255, 255, .82); box-shadow: 0 1.25rem 3rem rgba(47, 104, 145, .15); }
    h1 { margin: 0 0 .75rem; font-size: 1.35rem; }
    p { margin: 0; line-height: 1.6; }
    p + p { margin-top: .8rem; color: #526b7f; font-size: .92rem; }
</style>
</head>
<body>
<main>
    <h1>This Program cannot load</h1>
    <p>The desktop is connected, but this hosting server blocks requests made by isolated Program frames.</p>
    <p>Configure the server or reverse proxy to preserve the CORS headers on <code>/program/*</code>, including requests whose origin is <code>null</code>, then reload the desktop.</p>
</main>
</body>
</html>`
