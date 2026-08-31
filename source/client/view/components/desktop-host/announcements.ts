import { type default as AuthManager } from "@client/core/link-manager/auth-manager/auth-manager"
import { type HostedEntry } from "@server/core/link-manager/auth-manager/program-manager/entry"
import ReactTunnel from "@libs/the-link/plugins/react-helper/react-tunnel"
import { useCallback } from "react"
import ClientProcessBoundary from "./client-process-boundary"
import ClientTraffic from "./client-traffic"
import { sdkProcess } from "./sdk-records"

/**
 * Host facts routed to the client Process boundaries that may represent them.
 *
 * Structural isolation is decided here: a pane can be offered only facts about
 * itself and its own Program. The boundary joins a desktop-local `the-link`
 * route only after its endpoint subscribes, so an uninterested boundary is not
 * entered at all. Eligibility and interest are separate decisions, and neither
 * is inferred by application code.
 *
 * Three kinds are eligible. A pane's **own Program's windows** — relayed
 * exactly as the system said them, because the system is what decided a
 * window moved or took focus and a second opinion here would be a second
 * answer. Its **own Program's** processes coming and going,
 * so a client half that can list its instances can also know when the
 * list changed without polling for it. And a **process ending**, to the
 * panes that could be holding that process — which is every pane of its
 * program, since a pane can hold no other.
 *
 * Nothing about another program is routed to anyone, at any point.
 *
 * A server half reaches the same facts through its own subscribed host routes;
 * the desktop does not reinterpret them.
 */
export default function useAnnouncements(authManager: AuthManager, panes: Map<string, ClientProcessBoundary>, traffic: ClientTraffic) {

    // Two tunnels, because there are two managers and each carries its
    // own words. A subscription put on the wrong one is silent forever
    // and looks exactly like a subscription that is simply never
    // triggered — which is what happened to `/uninstall`, added next to
    // its neighbours without checking they travelled the same road.
    const processes = ReactTunnel.useFactory(authManager.processManager.$inbound)

    const programs = ReactTunnel.useFactory(authManager.programManager.$inbound)

    const announce = useCallback(function (identity: string, route: string, ...args: unknown[]) {

        traffic.emit(identity, route, ...args).catch(() => undefined)

    }, [traffic])

    const post = useCallback(function (offers: Offer[]) {

        for (const [pane, ...message] of offers) announce(pane, ...message)

    }, [announce])

    processes.useSubscribe("/created", useCallback((...results: unknown[]) => {

        const [payload] = results as [ExitedProcess | null]

        if (payload) post(created(authManager, whose(authManager, panes), payload))

    }, [post, authManager, panes]))

    processes.useSubscribe("/exited", useCallback((...results: unknown[]) => {

        const [process, code, signal] = results as [ExitedProcess | null, number | null, string | null]

        if (process) post(exited(authManager, whose(authManager, panes), process, code, signal))

    }, [post, authManager, panes]))

    const changed = useCallback((event: EndpointEvent, endpointKind: EndpointKind, results: unknown[]) => {

        const [identity, payload] = results as [string | null, ExitedProcess | null]

        if (identity && payload) post(endpoint(authManager, whose(authManager, panes), event, endpointKind, payload))

    }, [post, authManager, panes])

    processes.useSubscribe("/server-start", useCallback((...results: unknown[]) => changed("endpointStart", "server", results), [changed]))

    processes.useSubscribe("/server-stop", useCallback((...results: unknown[]) => changed("endpointStop", "server", results), [changed]))

    processes.useSubscribe("/client-start", useCallback((...results: unknown[]) => changed("endpointStart", "client", results), [changed]))

    processes.useSubscribe("/client-stop", useCallback((...results: unknown[]) => changed("endpointStop", "client", results), [changed]))

    // A program leaving the list, said to the windows of that program.
    //
    // A pane outlives its own program's removal — uninstalling ends
    // nothing that is running — so there is something left to hear it,
    // and this is the only way one could learn that what it is a face of
    // is no longer on the machine.
    programs.useSubscribe("/uninstall", useCallback((...results: unknown[]) => {

        const [program, everything] = results as [HostedEntry, boolean]

        post(uninstalled(whose(authManager, panes), program, everything === true))

    }, [post, authManager, panes]))

    // Everything a window says, relayed whole to subscribed panes allowed to
    // hold that Client: every pane of its Program, and no pane outside it.
    // The system decided what happened and to which Client; this decides
    // neither again.
    processes.useSubscribe("/said", useCallback((...results: unknown[]) => {

        const [identity, event, value] = results as [string, string, unknown]

        const target = authManager.processManager.processes.get(identity)

        if (!target) return

        const eligible = whose(authManager, panes)
            .filter(([, program]) => program === target.program)
            .map(([pane]) => [pane, "host-end", event, target.reference, value] as Offer)

        post(eligible)

    }, [post, authManager, panes]))
}

// ── What is routed, and to whom ──────────────────────────────────────
//
// Kept out of the hook because this is the part with a rule in it. The
// hook posts what these decide; these decide it from what the desktop
// already holds, and from nothing any pane said. A pane cannot ask to be
// in one of these lists, which is the isolation as a structure rather
// than as a check.

// Each pane, and the program it is a face of.
export function whose(authManager: AuthManager, panes: Map<string, unknown>) {

    return [...panes.keys()].map(pane => [pane, authManager.processManager.processes.get(pane)?.program] as const)
}

// The subject leads, exactly as it does on the core's own announcement,
// so a kit's `Program` filters on it without either side agreeing to
// anything extra.
export function created(authManager: AuthManager, panes: readonly (readonly [string, string | undefined])[], process: ExitedProcess): Offer[] {

    const program = authManager.programManager.programs.get(process.program)

    if (!program) return []

    return panes.filter(([, identity]) => identity === process.program).map(([pane]) => [pane, "program-process", "create", program.reference, record(authManager, process)])
}

// One ending, said to two subjects. A program watching its instances
// wants the first; whoever holds this one process wants the second.
export function exited(authManager: AuthManager, panes: readonly (readonly [string, string | undefined])[], process: ExitedProcess, code: number | null, signal: string | null): Offer[] {

    // The subject leads both, and what follows is the thing the event is
    // about — the process itself rather than an identity a listener would
    // have to look up. It is already gone, which is what `exited()`
    // answers and why holding it is legitimate.
    //
    // Built here from what the ending carried, because the record was
    // dropped before this was sent — which is why the ending carries
    // when it started at all. A listener handed a process must be handed
    // the whole of one.
    return panes.filter(([, shown]) => shown === process.program).flatMap(([pane]) => [

        [pane, "program-process", "exit", owner(authManager, process).reference, record(authManager, process), code, signal],

        [pane, "process-host", "exit", process.reference, code, signal]

    ] as Offer[])
}

export function endpoint(authManager: AuthManager, panes: readonly (readonly [string, string | undefined])[], event: EndpointEvent, endpointKind: EndpointKind, process: ExitedProcess): Offer[] {

    const processRecord = record(authManager, process)

    return panes
        .filter(([, shown]) => shown === process.program)
        .map(([pane]) => [pane, "process-host", event, process.reference, processRecord, endpointKind])
}

function record(authManager: AuthManager, process: ExitedProcess) {

    return sdkProcess(process, owner(authManager, process))
}

function owner(authManager: AuthManager, process: ExitedProcess) {

    const program = authManager.programManager.programs.get(process.program)

    if (!program) throw new Error("The desktop does not know this program")

    return program
}

// A program left the installed state, routed to its panes and no others.
// What comes with it is whether everything the system owned went too.
export function uninstalled(panes: readonly (readonly [string, string | undefined])[], program: { identity: string, reference: string }, everything: boolean): Offer[] {

    return panes.filter(([, shown]) => shown === program.identity).map(([pane]) => [pane, "program-host", "uninstall", program.reference, everything])
}

type ExitedProcess = { reference: string, identity: string, program: string, startedAt: Date, name: string | null, options: Record<string, string>, server: { ready: boolean } | null, client: { window: unknown } | null }

type EndpointEvent = "endpointStart" | "endpointStop"

type EndpointKind = "server" | "client"

export type Offer = [pane: string, route: string, ...message: unknown[]]
