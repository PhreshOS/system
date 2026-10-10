import { defaultDesktopScale } from "@phreshos/core"
import { createContext, type CSSProperties, type ReactNode, useContext, useMemo } from "react"

const DesktopScaleContext = createContext<DesktopScale>({ scale: defaultDesktopScale, container: null })

/** Establishes the ratio between physical browser pixels and Desktop pixels. */
export function DesktopScaleProvider({ children, scale, container }: Readonly<{ children: ReactNode, scale: number, container: HTMLElement | null }>) {
    const value = useMemo(() => ({ scale, container }), [container, scale])

    return <DesktopScaleContext.Provider value={value}>{children}</DesktopScaleContext.Provider>
}

/** Returns the effective scale of the containing Desktop representation. */
export function useDesktopScale() {
    return useContext(DesktopScaleContext).scale
}

/** Returns the DOM boundary through which Desktop overlays inherit that scale. */
export function useDesktopScaleContainer() {
    return useContext(DesktopScaleContext).container
}

/**
 * Places a frame filling its container in the Desktop's scale. The frame takes no zoom itself: its
 * document is laid out at the frame's own size and the frame is enlarged as a picture. Under zoom,
 * Safari lays a frame's document out at the zoomed size while showing it at the unzoomed one, so its
 * content is cut off or leaves empty bands.
 */
export function useDesktopFrameStyle(): CSSProperties {
    const scale = useDesktopScale()

    return useMemo(() => ({
        zoom: 1 / scale,
        width: `${100 / scale}%`,
        height: `${100 / scale}%`,
        transform: `scale(${scale})`,
        transformOrigin: "0 0"
    }), [scale])
}

/** Converts one physical browser distance into the Desktop coordinate space. */
export function physicalToDesktopPixels(value: number, scale: number) {
    return value / scale
}

interface DesktopScale {
    readonly scale: number
    readonly container: HTMLElement | null
}
