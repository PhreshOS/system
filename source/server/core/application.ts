import LinkManager from "./link-manager/link-manager"
import Authentication from "./authentication/authentication"
import FileManager from "@libs/file-manager"
import Encryptor from "@libs/encryptor"
import UploadManager from "./upload-manager"
import DialogManager from "./dialog-manager"
import AppearanceManager from "./appearance-manager"
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

    public readonly uploads: UploadManager

    public readonly dialogManager: DialogManager

    public readonly appearanceManager: AppearanceManager

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

        this.uploads = payload.uploads

        this.appearanceManager = payload.appearanceManager

        this.dialogManager = new DialogManager()

        this.linkManager = new LinkManager(this)

        this.systemControl = new SystemControl(this)
    }

    public static async initialize(name: string, displayName: string, version: string, homePath: string, defaultProgramIcon: string) {

        const storage = new FileManager(homePath)

        const home = new FileArea(homedir(), "the native home directory")

        const store = openStore(storage.path)

        const encryptor = await Encryptor.initialize(storage.join("private.pem"))

        const authentication = await Authentication.open(storage.join("credentials.json"), store)

        const uploads = new UploadManager(storage.navigateTo("uploads"))

        const appearanceManager = await AppearanceManager.open(store, uploads)

        const application = new Application({ name, displayName, version, defaultProgramIcon, storage, home, store, encryptor, authentication, appearanceManager, uploads })

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

    encryptor: Encryptor

    authentication: Authentication

    appearanceManager: AppearanceManager

    uploads: UploadManager
}
