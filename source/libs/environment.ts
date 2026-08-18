/** Read one application-scoped environment variable without interpreting it. */
export default function environment(application: string, variable: string, variables: Variables) {

    const scope = normalize(application)

    const name = normalize(variable)

    if (!scope) throw new Error("An environment variable needs an application name")

    if (!name) throw new Error("An environment variable needs a name")

    const key = `${scope}_${name}`

    return Object.freeze({ key, value: variables[key] })
}

function normalize(value: string) {

    return value.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").toUpperCase()
}

type Variables = Readonly<Record<string, string | undefined>>
