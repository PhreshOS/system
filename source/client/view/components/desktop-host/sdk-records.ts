export interface SdkProgramSource {

    reference: string
    identity: string
    installed: boolean
    name: string
    version: string | null
    description: string | null
    hasAgent: boolean
    server: unknown | null
    client: unknown | null
}

export interface SdkProcessSource {

    reference: string

    identity: string

    name: string | null

    program: string

    options: Record<string, string>

    startedAt: Date

    server: unknown | null

    client: unknown | null
}

/** Plain SDK Program state carried across the iframe boundary. */
export function sdkProgram(program: SdkProgramSource) {

    return {

        reference: program.reference,

        identity: program.identity,

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
export function sdkProcess(process: SdkProcessSource, program: SdkProgramSource) {

    return {

        reference: process.reference,

        identity: process.identity,

        name: process.name,

        program: sdkProgram(program),

        options: process.options,

        startedAt: process.startedAt,

        server: process.server ? {} : null,

        client: process.client ? {} : null
    }
}
