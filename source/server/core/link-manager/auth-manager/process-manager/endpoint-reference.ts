import type { EndpointReference as CoreEndpointReference, ProcessSnapshot } from "@phreshos/core"
import { type Half } from "./process-traffic"
import Process from "./process"

export type ProcessReference = ProcessSnapshot

/**
 * An endpoint identity carried only between trusted boundaries and SDKs.
 *
 * The host derives both fields from its authoritative Process registry.
 * Program code can therefore receive a real Endpoint handle without being
 * able to forge the sender or destination attached to application traffic.
 */
export type EndpointReference = CoreEndpointReference

export function processReference(process: Process): ProcessReference {

    return { ...process.record(), program: process.program.record() }
}

export function endpointReference(process: Process, kind: Half): EndpointReference {

    return { kind, process: processReference(process) } satisfies CoreEndpointReference
}
