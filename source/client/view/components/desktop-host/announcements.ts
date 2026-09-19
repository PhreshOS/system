import { type default as AuthManager } from "@client/core/link-manager/auth-manager/auth-manager"
import { type ProgramRecord } from "@server/core/link-manager/auth-manager/program-manager/entry"
import { ReactTunnel } from "@the-link/react"
import { useCallback } from "react"
import ClientProcessBoundary from "./client-process-boundary"
import ClientTraffic from "./client-traffic"
import { sdkProcess, sdkProgram } from "./sdk-records"
import SystemAccess from "./system-access"

/** Projects authoritative System announcements into every Client frame. */
export default function useAnnouncements(authManager: AuthManager, panes: Map<string, ClientProcessBoundary>, traffic: ClientTraffic) {

    const processes = ReactTunnel.useFactory(authManager.processManager.$inbound)
    const programs = ReactTunnel.useFactory(authManager.programManager.$inbound)
    const authentication = ReactTunnel.useFactory(authManager.$inbound)

    const post = useCallback(function (program: string, route: string, ...message: unknown[]) {

        for (const pane of panes.keys()) {

            const access = new SystemAccess(authManager, pane)

            access.canProgram({ identity: program }).then(granted => {

                if (granted) return traffic.emit(pane, route, ...message)
            }).catch(() => undefined)
        }

    }, [authManager, panes, traffic])

    const postVisible = useCallback(function (visible: (access: SystemAccess) => Promise<boolean>, route: string, ...message: unknown[]) {

        for (const pane of panes.keys()) {

            const access = new SystemAccess(authManager, pane)

            visible(access).then(granted => {

                if (granted) return traffic.emit(pane, route, ...message)
            }).catch(() => undefined)
        }

    }, [authManager, panes, traffic])

    const postConnection = useCallback(function (identity: string, route: string, ...message: unknown[]) {

        postVisible(access => access.canConnection(identity), route, ...message)

    }, [postVisible])

    const postSession = useCallback(function (identity: string, route: string, ...message: unknown[]) {

        postVisible(access => access.canSession(identity), route, ...message)

    }, [postVisible])

    authentication.useSubscribe("/connection/create", useCallback((value: unknown) => {

        const identity = domainIdentity(value)
        if (identity) postConnection(identity, "host-connection", "create", identity, value)
    }, [postConnection]))
    authentication.useSubscribe("/connection/disconnect", useCallback((value: unknown) => {

        const identity = domainIdentity(value)
        if (identity) postConnection(identity, "host-connection", "disconnect", identity, value)
    }, [postConnection]))
    authentication.useSubscribe("/connection/session-change", useCallback((value: unknown, session: unknown) => {

        const identity = domainIdentity(value)
        if (identity) postConnection(identity, "connection-host", "sessionChange", identity, session)
    }, [postConnection]))
    authentication.useSubscribe("/session/create", useCallback((value: unknown) => {

        const identity = domainIdentity(value)
        if (identity) postSession(identity, "host-session", "create", identity, value)
    }, [postSession]))
    authentication.useSubscribe("/session/connection-attach", useCallback((value: unknown, connection: unknown) => {

        const session = domainIdentity(value)
        const attached = domainIdentity(connection)
        if (session && attached) postVisible(
            async access => await access.canSession(session) && await access.canConnection(attached),
            "session-host",
            "connectionAttach",
            session,
            connection
        )
    }, [postVisible]))
    authentication.useSubscribe("/session/connection-detach", useCallback((value: unknown, connection: unknown) => {

        const session = domainIdentity(value)
        const detached = domainIdentity(connection)
        if (session && detached) postConnection(detached, "session-host", "connectionDetach", session, connection)
    }, [postConnection]))
    authentication.useSubscribe("/session/end", useCallback((value: unknown, reason: unknown, previousConnections: unknown) => {

        const identity = domainIdentity(value)
        if (!identity) return

        const connections = Array.isArray(previousConnections)
            ? previousConnections.map(domainIdentity).filter((entry): entry is string => entry !== null)
            : []

        const visible = async (access: SystemAccess) => await access.canSession(identity)
            || await any(connections, connection => access.canConnection(connection))

        postVisible(visible, "session-host", "end", identity, reason)
        postVisible(visible, "host-session", "end", identity, value, reason)
    }, [postVisible]))

    processes.useSubscribe("/created", useCallback((payload: HostedProcessRecord | null) => {

        if (!payload) return

        const record = processRecord(authManager, payload)

        post(payload.program, "host-process", "create", payload.program, record)
        post(payload.program, "program-host", "processCreate", program(authManager, payload.program).reference, record)

    }, [authManager, post]))

    processes.useSubscribe("/exited", useCallback((payload: HostedProcessRecord | null, code: number | null, signal: string | null) => {

        if (!payload) return

        const record = processRecord(authManager, payload)

        post(payload.program, "host-process", "exit", payload.program, record, code, signal)
        post(payload.program, "program-host", "processExit", program(authManager, payload.program).reference, record, code, signal)
        post(payload.program, "process-host", "exit", payload.reference, code, signal)

    }, [authManager, post]))

    const endpoint = useCallback((event: "endpointStart" | "endpointStop", endpoint: "server" | "client", payload: HostedProcessRecord | null) => {

        if (!payload) return

        post(payload.program, "process-host", event, payload.reference, processRecord(authManager, payload), endpoint)

    }, [authManager, post])

    processes.useSubscribe("/server-start", useCallback((_identity: unknown, payload: HostedProcessRecord | null) => endpoint("endpointStart", "server", payload), [endpoint]))
    processes.useSubscribe("/server-stop", useCallback((_identity: unknown, payload: HostedProcessRecord | null) => endpoint("endpointStop", "server", payload), [endpoint]))
    processes.useSubscribe("/client-start", useCallback((_identity: unknown, payload: HostedProcessRecord | null) => endpoint("endpointStart", "client", payload), [endpoint]))
    processes.useSubscribe("/client-stop", useCallback((_identity: unknown, payload: HostedProcessRecord | null) => endpoint("endpointStop", "client", payload), [endpoint]))

    processes.useSubscribe("/said", useCallback((identity: string, event: string, value: unknown) => {

        const target = authManager.processManager.processes.get(identity)

        if (target) post(target.program, "host-end", event, target.reference, value)

    }, [authManager, post]))

    const programEvent = useCallback((event: "create" | "install" | "uninstall" | "forget", entry: ProgramRecord | null, purge?: boolean) => {

        if (!entry) return

        const record = sdkProgram(entry)

        post(entry.identity, "host-program", event, entry.identity, record, purge === true)

        if (event === "uninstall") post(entry.identity, "program-host", event, entry.reference, purge === true)
        if (event === "forget") post(entry.identity, "program-host", event, entry.reference)

    }, [post])

    programs.useSubscribe("/create", useCallback((entry: ProgramRecord | null) => programEvent("create", entry), [programEvent]))
    programs.useSubscribe("/install", useCallback((entry: ProgramRecord | null) => programEvent("install", entry), [programEvent]))
    programs.useSubscribe("/uninstall", useCallback((entry: ProgramRecord | null, purge: boolean) => programEvent("uninstall", entry, purge), [programEvent]))
    programs.useSubscribe("/forgotten", useCallback((entry: ProgramRecord | null) => programEvent("forget", entry), [programEvent]))
}

function domainIdentity(value: unknown) {

    if (!value || typeof value !== "object") return null

    const identity = (value as { identity?: unknown }).identity

    return typeof identity === "string" ? identity : null
}

async function any<Value>(values: readonly Value[], predicate: (value: Value) => Promise<boolean>) {

    for (const value of values) if (await predicate(value)) return true

    return false
}

function processRecord(authManager: AuthManager, process: HostedProcessRecord) {

    return sdkProcess(process, program(authManager, process.program))
}

function program(authManager: AuthManager, identity: string) {

    const found = authManager.programManager.programs.get(identity)

    if (!found) throw new Error("The desktop does not know this program")

    return found
}

type HostedProcessRecord = {
    reference: string
    identity: string
    program: string
    startedAt: Date
    name: string | null
    options: Record<string, string>
    server: { ready: boolean, service: boolean } | null
    client: { service: boolean } | null
}
