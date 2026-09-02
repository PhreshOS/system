import { type Dispatch, type SetStateAction, useLayoutEffect, useMemo, useRef } from "react"

export type ProgramAccess = "checking" | "available" | "blocked"

const request = "program-access-request"
const response = "program-access"
const timeout = 10_000

/** Tests the Desktop's Program asset address from an opaque CORS origin. */
export default function ProgramAccessProbe({ door, setAccess }: ProgramAccessProbeProps) {

    const frame = useRef<HTMLIFrameElement>(null)

    const document = useMemo(function () {

        const url = new URL(`${door}/ping`, window.location.href).href

        return `<!doctype html><meta charset="utf-8"><script>
let requested = false;
let result;
function report() {
    if (requested && typeof result === "boolean") parent.postMessage([${JSON.stringify(response)}, result], "*");
}
addEventListener("message", event => {
    if (event.data !== ${JSON.stringify(request)}) return;
    requested = true;
    report();
});
fetch(${JSON.stringify(url)}, { cache: "no-store" })
    .then(value => { result = value.ok; report(); })
    .catch(() => { result = false; report(); });
</script>`

    }, [door])

    useLayoutEffect(function () {

        const timer = window.setTimeout(() => setAccess("blocked"), timeout)

        function receive(event: MessageEvent) {

            if (event.source !== frame.current?.contentWindow) return

            if (!Array.isArray(event.data) || event.data[0] !== response || typeof event.data[1] !== "boolean") return

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

        srcDoc={document}

        title="Program asset compatibility check"

        sandbox="allow-scripts"

        onLoad={event => event.currentTarget.contentWindow?.postMessage(request, "*")}

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
</head>
<body>
<h1>This Program cannot load</h1>
<p>The Desktop address or its reverse proxy does not preserve CORS access to <code>/program/*</code>.</p>
</body>
</html>`
