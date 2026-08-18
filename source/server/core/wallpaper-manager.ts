import { extname } from "node:path"
import Keyv from "keyv"
import { z } from "zod"
import { type WallpaperLaunch } from "@phreshos/core"
import ServedFileManager from "./served-file-manager"
import { type default as Program } from "./link-manager/auth-manager/program-manager/program"
import { type default as ProgramManager } from "./link-manager/auth-manager/program-manager/program-manager"

const signInKey = "appearance:signInWallpaper"
const desktopKey = "appearance:desktopWallpaper"

const servedFileSchema = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]+$/)

const launchSchema: z.ZodType<WallpaperLaunch> = z.strictObject({
    name: z.string().min(1).optional(),
    server: z.boolean().optional(),
    client: z.strictObject({ location: z.string().optional() }).optional(),
    options: z.record(z.string(), z.string()).optional()
})

const desktopSchema = z.discriminatedUnion("type", [

    z.strictObject({ type: z.literal("file"), file: servedFileSchema }),

    z.strictObject({
        type: z.literal("program"),
        program: z.string().min(1),
        launch: launchSchema
    })
]).nullable()

const signInSchema = servedFileSchema.nullable()

const wallpaperExtensions = new Set(["avif", "bmp", "gif", "htm", "html", "jpeg", "jpg", "png", "svg", "webp"])

export type DesktopWallpaperState = z.infer<typeof desktopSchema>

/** Durable appearance choices and the lifecycle of the optional wallpaper Program. */
export default class WallpaperManager {

    private changing: Promise<void> = Promise.resolve()

    private constructor(
        private readonly store: Keyv,
        private readonly servedFiles: ServedFileManager,
        private signInValue: string | null,
        private desktopValue: DesktopWallpaperState
    ) { }

    /** Opens and validates only the current appearance keys. */
    public static async open(store: Keyv, servedFiles: ServedFileManager) {

        const storedSignIn = await store.get(signInKey)

        const storedDesktop = await store.get(desktopKey)

        const signIn = signInSchema.parse(storedSignIn ?? null)

        const desktop = desktopSchema.parse(storedDesktop ?? null)

        if (storedSignIn === undefined) await store.set(signInKey, signIn)

        if (storedDesktop === undefined) await store.set(desktopKey, desktop)

        return new WallpaperManager(store, servedFiles, signIn, desktop)
    }

    /** File selected for sign-in, or `null` for the bundled wallpaper. */
    public get signIn() { return this.signInValue }

    /** File selected for the desktop, or `null` when bundled or Program-backed. */
    public get desktopFile() { return this.desktopValue?.type === "file" ? this.desktopValue.file : null }

    /** Restores the persisted Program wallpaper after the Program registry exists. */
    public async initialize(programs: ProgramManager) {

        const selected = this.desktopValue

        if (selected?.type !== "program") return

        const program = programs.reach(selected.program)

        if (!program) return

        try { await programs.startWallpaper(program, selected.launch) }

        catch (exception) {

            console.log(`wallpaper: ${selected.program} did not start — ${exception instanceof Error ? exception.message : "unavailable"}`)
        }
    }

    public setSignIn(file: unknown) {

        return this.change(async () => {

            const selected = this.file(file)

            await this.store.set(signInKey, selected)

            this.signInValue = selected

            return selected
        })
    }

    public removeSignIn() {

        return this.change(async () => {

            await this.store.set(signInKey, null)

            this.signInValue = null

            return null
        })
    }

    public setDesktopFile(file: unknown, programs: ProgramManager) {

        return this.change(async () => {

            const selected = this.file(file)

            await this.exitProgram(programs)

            this.desktopValue = { type: "file", file: selected }

            await this.store.set(desktopKey, this.desktopValue)

            return selected
        })
    }

    public removeDesktop(programs: ProgramManager) {

        return this.change(async () => {

            await this.exitProgram(programs)

            this.desktopValue = null

            await this.store.set(desktopKey, null)

            return null
        })
    }

    public setDesktopProgram(program: Program, value: unknown, programs: ProgramManager) {

        return this.change(async () => {

            if (!program.client) throw new Error("A desktop wallpaper Program must declare a Client")

            const launch = launchSchema.parse(value ?? {})

            await this.exitProgram(programs)

            this.desktopValue = { type: "program", program: program.identity, launch }

            await this.store.set(desktopKey, this.desktopValue)

            await programs.startWallpaper(program, launch)

            return program.identity
        })
    }

    private file(value: unknown) {

        const file = servedFileSchema.parse(value)

        if (!wallpaperExtensions.has(extname(file).slice(1))) throw new Error("A wallpaper must be an image or HTML file")

        this.servedFiles.describe(file)

        return file
    }

    private async exitProgram(programs: ProgramManager) {

        for (const process of [...programs.authManager.processManager.processes.values()]) {

            if (process.client?.window.layer !== "wallpaper") continue

            await process.stop()
        }
    }

    private change<Result>(operation: () => Promise<Result>) {

        const changing = this.changing.then(operation)

        this.changing = changing.then(() => undefined, () => undefined)

        return changing
    }
}
