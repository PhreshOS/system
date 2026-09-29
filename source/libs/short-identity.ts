/**
 * Crockford's base32 in lower case: digits and letters without i, l, o and u, so an identity reads
 * and types without confusing one character for another.
 */
const alphabet = "0123456789abcdefghjkmnpqrstvwxyz"

/** Ten characters of 32: fifty random bits. */
const length = 10

/**
 * A short random identity for what people name by hand, such as a Process, a Connection, or a
 * Session typed into the CLI. It names; it grants nothing, so it need not be unguessable. What is
 * reached from outside by its identity alone, such as Program assets or uploads, keeps a UUID.
 */
export default function shortIdentity() {

    const bytes = crypto.getRandomValues(new Uint8Array(length))

    // 256 is a multiple of 32, so the low five bits of each byte are evenly spread.
    return Array.from(bytes, byte => alphabet[byte & 31]).join("")
}
