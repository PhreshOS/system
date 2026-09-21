import type Program from "../link-manager/auth-manager/program-manager/program"
import type { ServerRuntime } from "../server-runtime"
import CommandServerRuntime from "./command"
import SandboxServerRuntime from "./sandbox"
import WorkerServerRuntime from "./worker"

/** Creates the Core-owned execution adapter selected by a Program definition. */
export default function createServerRuntime(program: Program): ServerRuntime {

    const server = program.server

    if (!server || !program.serverPath) throw new Error("This Program declared no Server Endpoint")

    if (server.command !== undefined) return new CommandServerRuntime(server.command, program.serverPath)
    if (server.worker !== undefined) return new WorkerServerRuntime(program.serverEntryPath!)
    return new SandboxServerRuntime(program.serverEntryPath!, program.serverPath)
}
