import { DependencyList, useEffect } from "react"

/**
 * Registers a cleanup function that runs when the component unmounts
 * or when any value in the dependency list changes.
 * 
 * Wraps `useEffect` so that only the teardown callback needs to be provided,
 * keeping call sites concise when no setup logic is required.
 * 
 * @param cleanup - Teardown function executed on unmount or dependency change
 * @param deps - Optional dependency list controlling when the cleanup is re-registered
 */
export default function useCleanup(cleanup: () => void, deps?: DependencyList) {

    // Delegate to useEffect, returning the cleanup directly as the teardown phase
    useEffect(() => cleanup, deps)
}