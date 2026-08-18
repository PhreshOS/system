import superjson from "superjson"

/**
 * Convert any JavaScript value to a JSON string with type preservation.
 * 
 * @param value The value to stringify
 * @returns JSON string with embedded type metadata
 */
export const stringify = (value: unknown) => superjson.stringify(resolve(value))

/**
 * Resolve toJSON declarations before SuperJSON walks the value. SuperJSON
 * preserves special types only where its own traversal sees them — and its
 * traversal does not descend into toJSON results, so a Map inside one
 * degrades to a plain object. Resolving first makes the runtime honor what
 * the Transmitted type already promises (case 5). Types SuperJSON carries
 * natively are left untouched — Date and URL have toJSON of their own,
 * and calling it would degrade them to strings.
 */
const resolve = (value: unknown): unknown => {

    if (value === null || typeof value !== "object") return value

    if (value instanceof Date || value instanceof RegExp || value instanceof URL || value instanceof Error) return value

    if (value instanceof Map) return new Map([...value].map(([key, entry]) => [resolve(key), resolve(entry)]))

    if (value instanceof Set) return new Set([...value].map(entry => resolve(entry)))

    if (Array.isArray(value)) return value.map(entry => resolve(entry))

    if ("toJSON" in value && typeof value.toJSON === "function") return resolve(value.toJSON())

    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, resolve(entry)]))
}

/**
 * Parse a SuperJSON string back to its original JavaScript value.
 * 
 * @param value The SuperJSON string to parse
 * @returns The reconstructed value with preserved types
 */
export const parse = <Value>(value: string) => superjson.parse<Transmitted<Value>>(value)

/**
 * Type representing a value after SuperJSON serialization.
 * 
 * Functions are converted to null, special types (Date, Map, Set, etc.) are preserved,
 * and object function properties are removed while maintaining all other properties.
 * 
 * @template T The original type before serialization
 */
export type Transmitted<T> =
    // Case 1: Functions are converted to null
    T extends Function
    ? null
    // Case 2: Maps are preserved, with key and value types recursively serialized
    : T extends Map<infer K, infer V>
    ? Map<Transmitted<K>, Transmitted<V>> // Recurse into key and value types
    // Case 3: Sets are preserved, with value types recursively serialized
    : T extends Set<infer U>
    ? Set<Transmitted<U>> // Recurse into value type
    // Case 4: Special types (Date, RegExp, URL, Error) are preserved as-is
    : T extends Date | RegExp | URL | Error
    ? T
    // Case 5: Objects with toJSON methods use the return type of toJSON, recursively serialized
    : T extends { toJSON(): infer R }
    ? Transmitted<R>
    // Case 6: Non-empty tuples are preserved, with each element recursively serialized
    : T extends readonly [infer U, ...infer V]
    ? [Transmitted<U>, ...Transmitted<V>]
    // Case 7: Empty tuples remain empty
    : T extends readonly []
    ? []
    // Case 8: Arrays are preserved, with element types recursively serialized
    : T extends Array<infer U>
    ? Array<Transmitted<U>>
    // Case 9: Plain objects have function properties removed, and other properties are recursively serialized
    : T extends object
    ? {
        // Filter out keys where the property is a function
        [K in keyof T as Extract<T[K], Function> extends never ? K : never]: Transmitted<T[K]>
    }
    // Case 10: Primitive values (string, number, boolean, etc.) are unchanged
    : T

/**
 * Default export containing all SuperJSON utilities.
 */
export default { stringify, parse }