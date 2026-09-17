import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { TheLink } from "@the-link/core"
import { expect, test } from "vitest"
import Application from "@server/core/application"

test("browser Connections and Sessions form one authoritative lifecycle", async () => {
    const home = await mkdtemp(join(tmpdir(), "phreshos-authentication-"))
    const application = await Application.initialize(
        "phreshos",
        "PhreshOS",
        "test",
        home,
        join(home, "icon.png")
    )
    const link = new TheLink()
    const connection = application.linkManager.addConnection(link)
    const secondLink = new TheLink()
    const secondConnection = application.linkManager.addConnection(secondLink)
    let token: string | null = null
    let signedOut = 0
    const stopToken = link.$outbound.subscribe("/session/signed-in", value => {
        if (typeof value === "string") token = value
    })
    const stopFirstSignOut = link.$outbound.subscribe("/session/signed-out", () => { signedOut += 1 })
    const stopSecondSignOut = secondLink.$outbound.subscribe("/session/signed-out", () => { signedOut += 1 })
    let secondRemoved = false

    try {
        expect(await connection.publish("/session-authenticate", null)).toEqual([false])
        expect(application.system.listConnections()).toEqual([connection])
        expect(application.system.connectionSession(connection.identity)).toBeNull()

        const created = await application.system.signInConnection(connection.identity)

        expect(token).toEqual(expect.any(String))
        expect(application.system.listSessions()).toEqual([created.identity])
        expect(application.system.connectionSession(connection.identity)).toEqual(created)
        expect(application.system.sessionConnections(created.identity)).toEqual([connection])
        await expect(application.system.signInConnection(connection.identity)).rejects.toThrow("already has a Session")

        await secondConnection.publish("/session-authenticate", token)

        expect(application.system.connectionSession(secondConnection.identity)).toEqual(created)
        expect(application.system.sessionConnections(created.identity)).toEqual([connection, secondConnection])

        await application.system.signOutSession(created.identity)

        expect(signedOut).toBe(2)
        expect(application.system.listSessions()).toEqual([])
        expect(application.system.connectionSession(connection.identity)).toBeNull()
        expect(application.system.connectionSession(secondConnection.identity)).toBeNull()
        expect(application.system.listConnections()).toEqual([connection, secondConnection])
        expect(application.system.sessionSnapshot(created.identity)).toEqual({ identity: created.identity, valid: false })
        expect(application.system.sessionConnections(created.identity)).toEqual([])
        await expect(application.system.signOutSession(created.identity)).rejects.toThrow("Session not found")

        await application.linkManager.removeConnection(secondConnection)
        secondRemoved = true

        expect(application.system.connectionSnapshot(secondConnection.identity)).toEqual({
            identity: secondConnection.identity,
            connected: false,
            session: null
        })
        expect(application.system.connectionSession(secondConnection.identity)).toBeNull()
        expect(() => application.system.signInConnection(secondConnection.identity)).toThrow("Connection not found")
    } finally {
        stopToken()
        stopFirstSignOut()
        stopSecondSignOut()
        await application.linkManager.removeConnection(connection)
        if (!secondRemoved) await application.linkManager.removeConnection(secondConnection)
        await application.store.disconnect()
        await rm(home, { recursive: true, force: true })
    }
})
