import { TheLink } from "@the-link/core"
import { Subscribe } from "@the-link/core/decorators"
import { parseShellEvent, type ShellOptions } from "@phreshos/core"
import type AuthManager from "./auth-manager"
import StreamRelay from "@client/core/link-manager/stream-relay"

/** Client-side adapter for authoritative System shell streams. */
export default class ShellManager extends TheLink {

    private readonly streams = new StreamRelay("Shell output", parseShellEvent)

    public constructor(authManager: AuthManager) {

        super()

        this.connectTo(authManager, "/frame/shell")
    }

    public run(command: string, options: Omit<ShellOptions, "signal">, asker: string) {

        return this.streams.open(
            stream => this.$outbound.publishFirst("/run", stream, command, options, asker),
            stream => this.$outbound.publish("/cancel", stream)
        )
    }

    @Subscribe("/event")
    protected event(stream: string, value: unknown) {

        this.streams.receive(stream, value)
    }
}
