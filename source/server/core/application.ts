import LinkManager from "./link-manager/link-manager"
import Authentication from "./authentication/authentication"
import FileManager from "@libs/file-manager"
import UploadManager from "./upload-manager"
import AppearanceManager from "./appearance-manager"
import openStore from "./open-store"
import Keyv from "keyv"
import FileArea, { FileSystem } from "@libs/file-area"
import { homedir } from "node:os"
import System from "./system"
import createServerRuntime from "./server-runtime/factory"
import SystemLogs from "./logs"

export default class Application {

    public readonly name: string

    public readonly displayName: string

    public readonly version: string

    /** Filesystem-owned fallback used by the authoritative Program icon service. */
    public readonly defaultProgramIcon: string

    public readonly storage: FileManager

    /** Native filesystem access entered from the operating-system user's home. */
    public readonly home: FileArea

    /** Internal application persistence, reached publicly through named methods. */
    public readonly store: Keyv

    public readonly authentication: Authentication

    public readonly uploads: UploadManager

    /** System-owned persistent records and their internal write capability. */
    public readonly logs: SystemLogs

    public readonly appearanceManager: AppearanceManager

    public readonly linkManager: LinkManager

    /** One authoritative System domain shared by every trusted adapter. */
    public readonly system: System

    /** Core-owned factory for every Server execution environment. */
    public readonly createServerRuntime: typeof createServerRuntime

    private constructor(payload: ApplicationPayload) {

        this.name = payload.name

        this.displayName = payload.displayName

        this.version = payload.version

        this.defaultProgramIcon = payload.defaultProgramIcon

        this.storage = payload.storage

        this.home = payload.home

        this.store = payload.store

        this.authentication = payload.authentication

        this.uploads = payload.uploads

        this.appearanceManager = payload.appearanceManager

        this.createServerRuntime = createServerRuntime

        this.logs = new SystemLogs(this.storage.join("logs.sqlite"))

        this.linkManager = new LinkManager(this)

        this.system = new System(this)
    }

    public static async initialize(name: string, displayName: string, version: string, homePath: string, defaultProgramIcon: string) {

        const storage = new FileManager(homePath)

        const home = new FileSystem(homedir(), "the native filesystem")

        const store = openStore(storage.path)

        const authentication = await Authentication.open(storage.join("credentials.json"), store)

        const uploads = new UploadManager(storage.navigateTo("uploads"))

        const appearanceManager = await AppearanceManager.open(store, uploads)

        const application = new Application({ name, displayName, version, defaultProgramIcon, storage, home, store, authentication, appearanceManager, uploads })

        await application.linkManager.authManager.programManager.initialize()

        return application
    }
}

interface ApplicationPayload {

    name: string

    displayName: string

    version: string

    defaultProgramIcon: string

    storage: FileManager

    home: FileArea

    store: Keyv

    authentication: Authentication

    appearanceManager: AppearanceManager

    uploads: UploadManager
}
