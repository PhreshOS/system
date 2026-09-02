import { type default as AuthManager } from "@client/core/link-manager/auth-manager/auth-manager"
import { type HostedEntry } from "@server/core/link-manager/auth-manager/program-manager/entry"
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

    const post = useCallback(function (program: string, route: string, ...message: unknown[]) {

        for (const pane of panes.keys()) {

            const access = new SystemAccess(authManager, pane)

            if (access.ownsProgram({ identity: program })) traffic.emit(pane, route, ...message).catch(() => undefined)
            else access.all().then(granted => {

                if (granted) return traffic.emit(pane, route, ...message)
            }).catch(() => undefined)
        }

    }, [authManager, panes, traffic])

    processes.useSubscribe("/created", useCallback((payload: ProcessRecord | null) => {

        if (!payload) return

        const record = processRecord(authManager, payload)

        post(payload.program, "host-process", "create", payload.program, record)
        post(payload.program, "program-process", "create", program(authManager, payload.program).reference, record)

    }, [authManager, post]))

    processes.useSubscribe("/exited", useCallback((payload: ProcessRecord | null, code: number | null, signal: string | null) => {

        if (!payload) return

        const record = processRecord(authManager, payload)

        post(payload.program, "host-process", "exit", payload.program, record, code, signal)
        post(payload.program, "program-process", "exit", program(authManager, payload.program).reference, record, code, signal)
        post(payload.program, "process-host", "exit", payload.reference, code, signal)

    }, [authManager, post]))

    const endpoint = useCallback((event: "endpointStart" | "endpointStop", endpoint: "server" | "client", payload: ProcessRecord | null) => {

        if (!payload) return

        post(payload.program, "process-host", event, payload.reference, processRecord(authManager, payload), endpoint)

    }, [authManager, post])

    processes.useSubscribe("/server-start", useCallback((_identity: unknown, payload: ProcessRecord | null) => endpoint("endpointStart", "server", payload), [endpoint]))
    processes.useSubscribe("/server-stop", useCallback((_identity: unknown, payload: ProcessRecord | null) => endpoint("endpointStop", "server", payload), [endpoint]))
    processes.useSubscribe("/client-start", useCallback((_identity: unknown, payload: ProcessRecord | null) => endpoint("endpointStart", "client", payload), [endpoint]))
    processes.useSubscribe("/client-stop", useCallback((_identity: unknown, payload: ProcessRecord | null) => endpoint("endpointStop", "client", payload), [endpoint]))

    processes.useSubscribe("/said", useCallback((identity: string, event: string, value: unknown) => {

        const target = authManager.processManager.processes.get(identity)

        if (target) post(target.program, "host-end", event, target.reference, value)

    }, [authManager, post]))

    const programEvent = useCallback((event: "create" | "install" | "uninstall" | "forget", entry: HostedEntry | null, everything?: boolean) => {

        if (!entry) return

        const record = sdkProgram(entry)

        post(entry.identity, "host-program", event, entry.identity, record, everything === true)

        if (event === "uninstall") post(entry.identity, "program-host", event, entry.reference, everything === true)
        if (event === "forget") post(entry.identity, "program-host", event, entry.reference)

    }, [post])

    programs.useSubscribe("/create", useCallback((entry: HostedEntry | null) => programEvent("create", entry), [programEvent]))
    programs.useSubscribe("/install", useCallback((entry: HostedEntry | null) => programEvent("install", entry), [programEvent]))
    programs.useSubscribe("/uninstall", useCallback((entry: HostedEntry | null, everything: boolean) => programEvent("uninstall", entry, everything), [programEvent]))
    programs.useSubscribe("/forgotten", useCallback((entry: HostedEntry | null) => programEvent("forget", entry), [programEvent]))
}

function processRecord(authManager: AuthManager, process: ProcessRecord) {

    return sdkProcess(process, program(authManager, process.program))
}

function program(authManager: AuthManager, identity: string) {

    const found = authManager.programManager.programs.get(identity)

    if (!found) throw new Error("The desktop does not know this program")

    return found
}

type ProcessRecord = {
    reference: string
    identity: string
    program: string
    startedAt: Date
    name: string | null
    options: Record<string, string>
    server: { ready: boolean, service: boolean } | null
    client: { window: unknown, service: boolean } | null
}
