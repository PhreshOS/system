import ThreadServerRuntime from "./thread"

/** Runs one capability-contained JavaScript Server Endpoint in QuickJS. */
export default class SandboxServerRuntime extends ThreadServerRuntime {

    public constructor(entry: string, root: string) {

        super(bootstrap("sandbox"), { entry, root })
    }
}

function bootstrap(runtime: "sandbox") {

    return new URL(`./${runtime}-bootstrap.${import.meta.url.endsWith(".ts") ? "ts" : "js"}`, import.meta.url)
}
