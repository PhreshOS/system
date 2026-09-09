import type Program from "@client/core/link-manager/auth-manager/program-manager/program"

export function searchTerms(query: string) {

    return query.trim().toLowerCase().split(/\s+/u).filter(Boolean)
}

export function matchesProgram(program: Pick<Program, "name" | "description" | "categories" | "keywords"> | undefined, terms: readonly string[]) {

    return terms.length === 0 || Boolean(program && matches(terms, [program.name, program.description, ...program.categories, ...program.keywords]))
}

export function matchesProcess(name: string | null, program: Parameters<typeof matchesProgram>[0], terms: readonly string[]) {

    return matches(terms, [name]) || matchesProgram(program, terms)
}

function matches(terms: readonly string[], fields: readonly (string | null)[]) {

    const text = fields.filter(value => value !== null).join("\n").toLowerCase()

    return terms.every(term => text.includes(term))
}
