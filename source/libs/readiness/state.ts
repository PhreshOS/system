/** The immutable state beneath a readiness boundary. */
export default class ReadinessState {

    public readonly requirements: readonly string[]

    public readonly pending: readonly string[]

    private constructor(requirements: readonly string[], pending: readonly string[]) {

        this.requirements = [...requirements]

        this.pending = [...pending]
    }

    public static start(requirements: readonly string[]) {

        validate(requirements)

        return new ReadinessState(requirements, requirements)
    }

    /** Mark one known requirement ready. Repeated readiness is harmless. */
    public ready(requirement: string) {

        if (!this.requirements.includes(requirement)) throw new Error(`Readiness does not know the requirement "${requirement}"`)

        if (!this.pending.includes(requirement)) return this

        const pending = this.pending.filter(candidate => candidate !== requirement)

        return new ReadinessState(this.requirements, pending)
    }

    /** Add new work or restore one completed requirement. */
    public require(requirement: string) {

        validateRequirement(requirement)

        if (this.pending.includes(requirement)) return this

        const requirements = this.requirements.includes(requirement)
            ? this.requirements
            : [...this.requirements, requirement]

        const restored = new Set([...this.pending, requirement])

        return new ReadinessState(requirements, requirements.filter(candidate => restored.has(candidate)))
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
