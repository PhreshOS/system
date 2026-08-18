import { type Half } from "./process-traffic"
import Process, { type ProcessRecord } from "./process"

export type ProcessReference = Omit<ProcessRecord, "program"> & Readonly<{

    program: ReturnType<Process["program"]["record"]>
}>

/**
 * An endpoint identity carried only between trusted boundaries and SDKs.
 *
 * The host derives both fields from its authoritative Process registry.
 * Program code can therefore receive a real Endpoint handle without being
 * able to forge the sender or destination attached to application traffic.
 */
export interface EndpointReference {

    readonly kind: Half

    readonly process: ProcessReference
}

export function processReference(process: Process): ProcessReference {

    return { ...process.record(), program: process.program.record() }
}

export function endpointReference(process: Process, kind: Half): EndpointReference {

    return { kind, process: processReference(process) }
}
