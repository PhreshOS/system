import { useEffect, useState } from "react"

/**
 * Runs `callback` once what changed now has been laid out and drawn: the frame after the next one.
 *
 * A motion starts its clock when it starts. Started together with work that reveals or lays out
 * content, it would spend its first frames waiting for that work and appear already late, often at
 * its end. Safari makes this common: it lays out and draws Program frames on the Desktop's own
 * thread. So a motion starts once the change it shows is on the screen. Returns a cancel.
 */
export function afterDrawn(callback: () => void): () => void {

    let handle = 0

    handle = requestAnimationFrame(() => {
        handle = requestAnimationFrame(() => {
            handle = 0
            callback()
        })
    })

    return () => cancelAnimationFrame(handle)
}

/**
 * The value as last drawn: a new value takes effect once the change that brought it is on the
 * screen (see `afterDrawn`). Give it to what starts a motion, such as a pose, never to what lays
 * out the content the motion reveals. `immediate` takes a new value at once, where nothing moves.
 */
export function useDrawn<Value>(value: Value, { initial = value, immediate = false }: Readonly<{ initial?: Value, immediate?: boolean }> = {}): Value {

    const [drawn, setDrawn] = useState(initial)

    useEffect(function () {

        if (Object.is(drawn, value)) return

        if (immediate) return setDrawn(value)

        return afterDrawn(() => setDrawn(value))

    }, [value, drawn, immediate])

    return immediate ? value : drawn
}
