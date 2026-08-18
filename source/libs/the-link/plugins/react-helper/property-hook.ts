import Property from "../../property"
import { useCallback, useSyncExternalStore } from "react"

/**
 * React hook for reading a Property value reactively.
 *
 * The Property remains the source of truth. React reads its current snapshot
 * and subscribes only for invalidation, so there is no mirrored state that can
 * fall out of step between rendering and effect setup.
 *
 * @param property Property instance to synchronize with React state
 * @returns Current property value, updated when the property publishes `change`
 *
 * @example
 * ```typescript
 * function ThemeLabel({ theme }: { theme: Property<string> }) {
 *     const value = useProperty(theme)
 *
 *     return <span>{value}</span>
 * }
 * ```
 */
export default function useProperty<Value>(property: Property<Value>) {

    const subscribe = useCallback((changed: () => void) => property.tunnel.subscribe("change", changed), [property])

    const snapshot = useCallback(() => property.value, [property])

    return useSyncExternalStore(subscribe, snapshot, snapshot)
}
