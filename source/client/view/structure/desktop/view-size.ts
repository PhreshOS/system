import { useLayoutEffect, useState, type RefObject } from "react"
import { type ViewSize } from "@client/view/components/window-manager/window-geometry"

/**
 * The size of this Desktop's view, in its own pixels: one view of the plane, which every layer is
 * drawn in and every standard Window is measured against.
 */
export default function useViewSize(desktop: RefObject<HTMLElement | null>): ViewSize {

    const [size, setSize] = useState<ViewSize>({ width: 0, height: 0 })

    useLayoutEffect(function () {

        const element = desktop.current

        if (!element) return

        const measure = () => setSize(current => current.width === element.clientWidth && current.height === element.clientHeight
            ? current
            : { width: element.clientWidth, height: element.clientHeight })

        measure()

        const observer = new ResizeObserver(measure)

        observer.observe(element)

        return () => observer.disconnect()

    }, [desktop])

    return size
}
