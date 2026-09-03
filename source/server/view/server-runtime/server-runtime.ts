import type Program from "@server/core/link-manager/auth-manager/program-manager/program"
import type { ServerRuntime } from "@server/core/server-runtime"
import CommandServerRuntime from "./command"
import WorkerServerRuntime from "./worker"

/** Creates the concrete View representation selected by a Program declaration. */
export default function serverRuntime(program: Program): ServerRuntime {

    const server = program.server

    if (!server) throw new Error("This program declared no server half")

    return server.startCommand !== undefined

        ? new CommandServerRuntime(server.startCommand, program.serverPath!)

        : new WorkerServerRuntime(program.serverEntryPath!)
}
