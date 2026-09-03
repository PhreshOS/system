import { TheLink } from "@the-link/core"
import { Connect, Subscribe } from "@the-link/core/decorators"
import type { ShellOptions } from "@phreshos/core"
import type AuthManager from "./auth-manager"

/** Authenticated bridge from one Client shell stream to the authoritative System. */
export default class ShellManager extends TheLink {

    private readonly commands = new Map<string, RunningShell>()

    public constructor(private readonly authManager: AuthManager) {

        super()

        this.connectTo(authManager, "/frame/shell")
    }

    @Connect("/run")
    protected async run(connection: string, stream: string, command: string, options: Omit<ShellOptions, "signal">, asker: string) {

        if (typeof connection !== "string" || typeof asker !== "string" || !asker) throw new Error("A Client shell command needs a requesting Process")
        if (typeof stream !== "string" || !stream || this.commands.has(stream)) throw new Error("A Client shell command needs a unique stream")
        if (!this.authManager.processManager.grants(asker, "all", [])) throw new Error("Execution is not permitted")

        const controller = new AbortController()
        const release = this.authManager.processManager.retainClientOperation(
            connection,
            asker,
            stream,
            () => controller.abort(new Error("The requester disconnected"))
        )

        if (!release) throw new Error("Execution is not permitted")

        this.commands.set(stream, { connection, controller })

        try {

            for await (const event of this.authManager.linkManager.application.system.shell(command, { ...options, signal: controller.signal })) {

                await this.authManager.publishToConnection(connection, "/frame/shell/event", stream, event)
            }
        }
        finally {

            release()
            this.commands.delete(stream)
        }
    }

    @Subscribe("/cancel")
    protected cancel(connection: unknown, stream: unknown) {

        const command = typeof stream === "string" ? this.commands.get(stream) : null

        if (command && command.connection === connection) command.controller.abort(new Error("The shell command was cancelled"))
    }

}

interface RunningShell {
    connection: string
    controller: AbortController
}
