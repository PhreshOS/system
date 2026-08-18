import { ChildProcess } from "node:child_process"

const terminationGrace = 1_000

/** The complete operating-system process tree beneath one child command. */
export default class ProcessTree {

    private readonly child: ChildProcess

    private readonly ended: Ending

    private forcing: ReturnType<typeof setTimeout> | null = null

    public constructor(child: ChildProcess, ended: Ending) {

        this.child = child

        this.ended = ended

        child.on("exit", (code, signal) => { this.finish(code, signal).catch(() => undefined) })
    }

    public stop() {

        signalProcessTree(this.child, "SIGTERM")

        if (this.forcing) return

        this.forcing = setTimeout(() => signalProcessTree(this.child, "SIGKILL"), terminationGrace)

        this.forcing.unref()
    }

    private async finish(code: number | null, signal: NodeJS.Signals | null) {

        if (this.forcing) {

            clearTimeout(this.forcing)

            this.forcing = null
        }

        await finishProcessTree(this.child)

        await this.ended(code, signal)
    }
}

/** Signal the complete process group represented by one child handle. */
export function signalProcessTree(child: ChildProcess, signal: NodeJS.Signals) {

    if (!child.pid) return

    try { process.kill(-child.pid, signal) }

    catch (error) {

        if ((error as NodeJS.ErrnoException).code === "ESRCH") return

        if (child.exitCode === null && child.signalCode === null) child.kill(signal)
    }
}

/** End descendants left behind when the command at the tree's root exits. */
async function finishProcessTree(child: ChildProcess) {

    const pid = child.pid

    if (!pid || !processTreeExists(pid)) return

    signalProcessTree(child, "SIGTERM")

    if (await waitForProcessTree(pid, terminationGrace)) return

    signalProcessTree(child, "SIGKILL")

    await waitForProcessTree(pid, terminationGrace)
}

async function waitForProcessTree(pid: number, timeout: number) {

    const began = Date.now()

    while (processTreeExists(pid)) {

        if (Date.now() - began >= timeout) return false

        await new Promise(resolve => setTimeout(resolve, 20))
    }

    return true
}

function processTreeExists(pid: number) {

    try {

        process.kill(-pid, 0)

        return true
    }

    catch (error) { return (error as NodeJS.ErrnoException).code !== "ESRCH" }
}

type Ending = (code: number | null, signal: NodeJS.Signals | null) => Promise<void> | void
