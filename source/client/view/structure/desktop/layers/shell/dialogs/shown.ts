import { useState } from "react"

/**
 * The value a dialog shows: the current one, or the last one while the dialog leaves, so its content
 * does not empty as it fades out.
 */
export default function useShown<Value>(value: Value | undefined) {
    const [shown, setShown] = useState(value)
    if (value !== undefined && value !== shown) setShown(value)
    return value ?? shown
}
