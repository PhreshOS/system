import { useCallback, useEffect, useState } from "react"

/**
 * Reactive localStorage hook with cross-component and cross-tab synchronization.
 * 
 * Wraps a single localStorage key with React state, providing memoized
 * update/remove operations that broadcast changes via StorageEvent,
 * and a nested subscription hook for external change listeners.
 * 
 * @param key - The localStorage key to manage
 * @returns Object containing the current value, update/remove operations, and a subscription hook
 * 
 * @example
 * ```typescript
 * const { value, update, remove, useSubscribe } = useStorage("session-id");
 * 
 * // Update value and broadcast change
 * update("abc-123");
 * 
 * // Subscribe to external changes
 * useSubscribe((newValue) => {
 *   if (!newValue) redirectToLogin();
 * });
 * ```
 */
export default function useStorage(key: string) {

    // Initialize state from current localStorage value (lazy initializer avoids read on every render)
    const [value, setValue] = useState(() => localStorage.getItem(key))

    /**
     * Persists a new value to localStorage and broadcasts the change via StorageEvent.
     * Short-circuits if the new value matches the current value to avoid redundant writes.
     */
    const update = useCallback(function (newValue: string) {

        // Skip redundant writes when value hasn't changed
        if (value === newValue) return

        // Persist the new value to localStorage
        localStorage.setItem(key, newValue)

        // Dispatch StorageEvent to notify same-tab listeners (native events only fire cross-tab)
        window.dispatchEvent(new StorageEvent("storage", { key, newValue }))

    }, [key, value])

    /**
     * Removes the key from localStorage and broadcasts a null-value StorageEvent.
     * Short-circuits if the value is already null to avoid redundant operations.
     */
    const remove = useCallback(function () {

        // Skip if key is already absent from localStorage
        if (value === null) return

        // Remove the key from localStorage
        localStorage.removeItem(key)

        // Broadcast removal as a null-value StorageEvent
        window.dispatchEvent(new StorageEvent("storage", { key, newValue: null }))

    }, [key, value])

    /**
     * Internal handler that updates React state when a matching StorageEvent is received.
     * Filters events by key to avoid reacting to unrelated storage changes.
     */
    const updateHandler = useCallback(function (event: StorageEvent) {

        // Only update state when the event targets this hook's key
        if (event.key === key) setValue(event.newValue)

    }, [])

    /**
     * Nested hook that subscribes an external callback to storage changes for this key.
     * Manages its own event listener lifecycle, cleaning up on unmount or dependency change.
     * 
     * @param subscriber - Callback invoked with the new value (or null on removal) when the key changes
     */
    const useSubscribe = useCallback(function (subscriber: Subscriber) {

        // Create a filtered event handler bound to the subscriber and current key
        const subscribeHandler = useCallback(function (event: StorageEvent) {

            // Forward the new value to the subscriber only for matching key events
            if (event.key === key) subscriber(event.newValue)

        }, [key, subscriber])

        // Attach and detach the storage event listener tied to the subscriber's lifecycle
        useEffect(function () {

            window.addEventListener("storage", subscribeHandler)

            return () => window.removeEventListener("storage", subscribeHandler)

        }, [subscribeHandler])

    }, [key])

    // Re-sync React state from localStorage whenever the key changes
    useEffect(() => setValue(localStorage.getItem(key)), [key])

    // Subscribe to StorageEvent for cross-component and cross-tab reactivity
    useEffect(function () {

        window.addEventListener("storage", updateHandler)

        return () => window.removeEventListener("storage", updateHandler)

    }, [updateHandler])

    return { value, update, remove, useSubscribe }
}

/**
 * Callback type for storage change subscriptions.
 * Receives the new value when the subscribed key is updated, or null when it is removed.
 * 
 * @param value - The updated localStorage value, or null if the key was removed
 */
export type Subscriber = (value: string | null) => void