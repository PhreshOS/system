/** The immutable state beneath a readiness boundary. */
export default class ReadinessState {

    public readonly requirements: readonly string[]

    public readonly pending: readonly string[]

    public readonly sealed: boolean

    private constructor(requirements: readonly string[], pending: readonly string[], sealed: boolean) {

        this.requirements = [...requirements]

        this.pending = [...pending]

        this.sealed = sealed
    }

    public static start(requirements: readonly string[]) {

        validate(requirements)

        return new ReadinessState(requirements, requirements, requirements.length === 0)
    }

    /** Mark one known requirement ready. Repeated readiness is harmless. */
    public ready(requirement: string) {

        if (!this.requirements.includes(requirement)) throw new Error(`Readiness does not know the requirement "${requirement}"`)

        if (!this.pending.includes(requirement)) return this

        const pending = this.pending.filter(candidate => candidate !== requirement)

        return new ReadinessState(this.requirements, pending, pending.length === 0)
    }

    /** Add work while the boundary is still pending. */
    public require(requirement: string) {

        validateRequirement(requirement)

        if (this.sealed) throw new Error("Readiness is already complete and cannot accept another requirement")

        if (this.requirements.includes(requirement)) throw new Error(`Readiness already knows the requirement "${requirement}"`)

        return new ReadinessState([...this.requirements, requirement], [...this.pending, requirement], false)
    }
}

function validate(requirements: readonly string[]) {

    const known = new Set<string>()

    for (const requirement of requirements) {

        validateRequirement(requirement)

        if (known.has(requirement)) throw new Error(`Readiness already knows the requirement "${requirement}"`)

        known.add(requirement)
    }
}

function validateRequirement(requirement: string) {

    if (!requirement.trim()) throw new Error("A readiness requirement must have a name")
}
