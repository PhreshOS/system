import { defaultDesktopScale } from "@phreshos/core"
import { createContext, type ReactNode, useContext, useMemo } from "react"

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

/** Converts one physical browser distance into the Desktop coordinate space. */
export function physicalToDesktopPixels(value: number, scale: number) {
    return value / scale
}

interface DesktopScale {
    readonly scale: number
    readonly container: HTMLElement | null
}
