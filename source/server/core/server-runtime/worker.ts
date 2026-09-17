import ThreadServerRuntime from "./thread"

/** Runs one JavaScript Server Endpoint in a Node Worker. */
export default class WorkerServerRuntime extends ThreadServerRuntime {

    public constructor(entry: string) {

        super(bootstrap("worker"), { entry })
    }
}

function bootstrap(runtime: "worker") {

    return new URL(`./${runtime}-bootstrap.${import.meta.url.endsWith(".ts") ? "ts" : "js"}`, import.meta.url)
}
