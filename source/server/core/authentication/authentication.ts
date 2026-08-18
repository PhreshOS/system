import { readFile, writeFile } from "node:fs/promises"
import { randomBytes, scrypt as derive, timingSafeEqual } from "node:crypto"
import Sessions from "./sessions"
import Keyv from "keyv"

const parameters = {

    cost: 16_384,

    blockSize: 8,

    parallelization: 1,

    keyLength: 64
} as const

const requirements = {

    username: {

        minimumLength: 1,

        maximumLength: 64
    },

    password: {

        minimumLength: 8,

        maximumLength: 1_024
    }
} as const

/** Persistent credentials for the sole owner of one installation. */
export default class Authentication {

    private owner: Owner | null

    private readonly path: string

    private readonly sessions: Sessions

    private constructor(path: string, owner: Owner | null, sessions: Sessions) {

        this.path = path

        this.owner = owner

        this.sessions = sessions
    }

    public static async open(path: string, store: Keyv) {

        const sessions = await Sessions.open(store)

        try {

            return new Authentication(path, parse(await readFile(path, "utf8")), sessions)
        }

        catch (exception) {

            if (isMissing(exception)) return new Authentication(path, null, sessions)

            throw exception
        }
    }

    public state(): AuthenticationState {

        return {

            registered: this.owner !== null,

            requirements
        }
    }

    public async register(username: string, password: string): Promise<RegistrationResult> {

        if (this.owner) return { error: "registered" }

        const normalizedUsername = normalizeUsername(username)

        const invalid = validate(normalizedUsername, password)

        if (invalid) return { error: invalid }

        const salt = randomBytes(16)

        const hash = await hashPassword(password, salt, parameters)

        const owner: Owner = {

            version: 1,

            username: normalizedUsername,

            password: {

                algorithm: "scrypt",

                salt: salt.toString("base64"),

                hash: hash.toString("base64"),

                ...parameters
            }
        }

        try {

            await writeFile(this.path, JSON.stringify(owner), { flag: "wx", mode: 0o600 })

            this.owner = owner

            return { registered: true }
        }

        catch (exception) {

            if (!isExisting(exception)) throw exception

            // Another registration won the exclusive write. Load that owner
            // before reporting the closed state so this instance cannot reopen it.
            this.owner = parse(await readFile(this.path, "utf8"))

            return { error: "registered" }
        }
    }

    public async verify(username: string, password: string) {

        if (!this.owner) return false

        if ([...password].length > requirements.password.maximumLength) return false

        const candidate = await hashPassword(password, Buffer.from(this.owner.password.salt, "base64"), this.owner.password)

        const expected = Buffer.from(this.owner.password.hash, "base64")

        return normalizeUsername(username) === this.owner.username

            && candidate.length === expected.length

            && timingSafeEqual(candidate, expected)
    }

    /** Creates a durable session after the owner has authenticated. */
    public createSession() {

        return this.sessions.create()
    }

    /** Whether a session is still within its connection-bound lifetime. */
    public sessionValid(identity: string) {

        return this.sessions.valid(identity)
    }

    /** Attaches a live connection and renews the session without a timer. */
    public connectSession(identity: string) {

        return this.sessions.connect(identity)
    }

    /** Records when the final live connection to a session disappears. */
    public disconnectSession(identity: string) {

        return this.sessions.disconnect(identity)
    }

    /** Revokes a session explicitly when its owner signs out. */
    public removeSession(identity: string) {

        return this.sessions.remove(identity)
    }
}

function normalizeUsername(username: string) {

    return username.trim().normalize("NFKC")
}

function validate(username: string, password: string): RegistrationError | null {

    const usernameLength = [...username].length

    if (usernameLength < requirements.username.minimumLength) return "username-required"

    if (usernameLength > requirements.username.maximumLength || /\p{Cc}/u.test(username)) return "username-invalid"

    const passwordLength = [...password].length

    if (passwordLength < requirements.password.minimumLength) return "password-too-short"

    if (passwordLength > requirements.password.maximumLength) return "password-too-long"

    if (password.normalize("NFKC").toLowerCase() === username.toLowerCase()) return "password-matches-username"

    return null
}

function hashPassword(password: string, salt: Buffer, parameters: ScryptParameters) {

    return new Promise<Buffer>(function (resolve, reject) {

        derive(password, salt, parameters.keyLength, {

            cost: parameters.cost,

            blockSize: parameters.blockSize,

            parallelization: parameters.parallelization,

            maxmem: 64 * 1_024 * 1_024

        }, function (exception, key) {

            if (exception) reject(exception)

            else resolve(key)
        })
    })
}

function parse(contents: string): Owner {

    const value: unknown = JSON.parse(contents)

    if (!isOwner(value)) throw new Error("The owner credentials are invalid")

    return value
}

function isOwner(value: unknown): value is Owner {

    if (!value || typeof value !== "object") return false

    const candidate = value as Partial<Owner>

    if (candidate.version !== 1

        || typeof candidate.username !== "string"

        || candidate.password?.algorithm !== "scrypt"

        || typeof candidate.password.salt !== "string"

        || typeof candidate.password.hash !== "string"

        || candidate.password.cost !== parameters.cost

        || candidate.password.blockSize !== parameters.blockSize

        || candidate.password.parallelization !== parameters.parallelization

        || candidate.password.keyLength !== parameters.keyLength) return false

    return Buffer.from(candidate.password.salt, "base64").length === 16

        && Buffer.from(candidate.password.hash, "base64").length === parameters.keyLength
}

function isMissing(exception: unknown) {

    return isFileError(exception, "ENOENT")
}

function isExisting(exception: unknown) {

    return isFileError(exception, "EEXIST")
}

function isFileError(exception: unknown, code: string) {

    return exception instanceof Error && "code" in exception && exception.code === code
}

export interface AuthenticationState {

    registered: boolean

    requirements: {

        username: {

            minimumLength: number

            maximumLength: number
        }

        password: {

            minimumLength: number

            maximumLength: number
        }
    }
}

export type RegistrationResult = {

    registered: true

} | {

    error: RegistrationError
}

export type RegistrationError = "registered" | "username-required" | "username-invalid" | "password-too-short" | "password-too-long" | "password-matches-username"

interface Owner {

    version: 1

    username: string

    password: {

        algorithm: "scrypt"

        salt: string

        hash: string

        cost: number

        blockSize: number

        parallelization: number

        keyLength: number
    }
}

interface ScryptParameters {

    cost: number

    blockSize: number

    parallelization: number

    keyLength: number
}
