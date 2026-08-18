import { createContext, useContext, type Provider } from "react"

/**
 * A typed React context that refuses use outside its provider.
 */
export default class ReactContext<Target> {

    public readonly context = createContext<Target | undefined>(undefined)

    public readonly Provider = this.context.Provider as Provider<Target>

    public useValue() {

        const value = useContext(this.context)

        if (value === undefined) throw new Error("Context was not provided")

        return value
    }
}
