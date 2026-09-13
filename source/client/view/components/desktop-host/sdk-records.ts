import type { ProcessSnapshot, ProgramSnapshot } from "@phreshos/core"

export type SdkProgramSource = ProgramSnapshot

export type SdkProcessSource = Omit<ProcessSnapshot, "program"> & { program: string }

/** Plain SDK Program state carried across the iframe boundary. */
export function sdkProgram(program: SdkProgramSource): ProgramSnapshot {

    return {

        reference: program.reference,

        identity: program.identity,

        assetId: program.assetId,

        installed: program.installed,

        name: program.name,

        version: program.version,

        description: program.description,

        hasAgent: program.hasAgent,

        server: program.server,

        client: program.client
    }
}

/** Plain Process state with its ownership chain embedded for synchronous navigation. */
export function sdkProcess(process: SdkProcessSource, program: SdkProgramSource): ProcessSnapshot {

    return {

        reference: process.reference,

        identity: process.identity,

        name: process.name,

        program: sdkProgram(program),

        options: process.options,

        startedAt: process.startedAt,

        server: process.server ? { service: process.server.service } : null,

        client: process.client ? { service: process.client.service } : null
    }
}
