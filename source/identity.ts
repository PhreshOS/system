import { version } from "@/package.json"

/** How PhreshOS names itself to people. */
export const name = "PhreshOS"

/** The version, as package.json holds it: a release bumps it there, and nowhere else. */
export { version }

/**
 * The name of this major version, and the Program that looks after it: it receives the owner when the
 * System is installed or upgraded to this version, and follows the System until the next one.
 */
export const release = Object.freeze({ name: "Sprout", program: "sprout" })
