import ThreadServerRuntime from "./thread"
import bootstrap from "./worker-bootstrap.ts?worker-thread"

/** Runs one JavaScript Server Endpoint in a Node Worker. */
export default class WorkerServerRuntime extends ThreadServerRuntime {

    public constructor(entry: string) {

        super(bootstrap, { entry })
    }
}
