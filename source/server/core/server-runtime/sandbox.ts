import ThreadServerRuntime from "./thread"
import bootstrap from "./sandbox-bootstrap.ts?worker-thread"

/** Runs one capability-contained JavaScript Server Endpoint in QuickJS. */
export default class SandboxServerRuntime extends ThreadServerRuntime {

    public constructor(entry: string, root: string) {

        super(bootstrap, { entry, root })
    }
}
