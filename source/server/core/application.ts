import LinkManager from "./link-manager/link-manager"
import Authentication from "./authentication/authentication"
import FileManager from "@libs/file-manager"
import Encryptor from "@libs/encryptor"
import ServedFileManager from "./served-file-manager"
import DialogManager from "./dialog-manager"
import ThemeManager from "./theme-manager"
import WallpaperManager from "./wallpaper-manager"
import openStore from "./open-store"
import Keyv from "keyv"
import FileArea from "@libs/file-area"
import { homedir } from "node:os"
import SystemControl from "./system-control/system-control"

export default class Application {

    public readonly name: string

    public readonly displayName: string

    public readonly version: string

    /** Filesystem-owned fallback used by the authoritative Program icon service. */
    public readonly defaultProgramIcon: string

    public readonly storage: FileManager

    /** Native operating-system home exposed as the Server Host's Storage root. */
    public readonly home: FileArea

    /** Internal application persistence, reached publicly through named methods. */
    public readonly store: Keyv

    public readonly encryptor: Encryptor

    public readonly authentication: Authentication

    public readonly servedFiles: ServedFileManager

    public readonly dialogManager: DialogManager

    public readonly themeManager: ThemeManager

    public readonly wallpaperManager: WallpaperManager

    public readonly linkManager: LinkManager

    public readonly systemControl: SystemControl

    private constructor(payload: ApplicationPayload) {

        this.name = payload.name

        this.displayName = payload.displayName

        this.version = payload.version

        this.defaultProgramIcon = payload.defaultProgramIcon

        this.storage = payload.storage

        this.home = payload.home

        this.encryptor = payload.encryptor

        this.store = payload.store

        this.authentication = payload.authentication

        this.themeManager = payload.themeManager

        this.wallpaperManager = payload.wallpaperManager

        this.servedFiles = payload.servedFiles

        this.dialogManager = new DialogManager()

        this.linkManager = new LinkManager(this)

        this.systemControl = new SystemControl(this)
    }

    public static async initialize(name: string, displayName: string, version: string, storagePath: string | undefined, defaultProgramIcon: string) {

        const storage = storagePath ? new FileManager(storagePath) : FileManager.forApp(name)

        const home = new FileArea(homedir(), "the native home directory")

        const store = openStore(storage.path)

        const encryptor = await Encryptor.initialize(storage.join("private.pem"))

        const authentication = await Authentication.open(storage.join("credentials.json"), store)

        const themeManager = await ThemeManager.open(store)

        const servedFiles = new ServedFileManager(storage.navigateTo("uploads"))

        const wallpaperManager = await WallpaperManager.open(store, servedFiles)

        const application = new Application({ name, displayName, version, defaultProgramIcon, storage, home, store, encryptor, authentication, themeManager, wallpaperManager, servedFiles })

        await application.linkManager.authManager.programManager.initialize()

        await application.wallpaperManager.initialize(application.linkManager.authManager.programManager)

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

    encryptor: Encryptor

    authentication: Authentication

    themeManager: ThemeManager

    wallpaperManager: WallpaperManager

    servedFiles: ServedFileManager
}
