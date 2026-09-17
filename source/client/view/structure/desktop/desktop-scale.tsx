import { defaultDesktopScale } from "@phreshos/core"
import { createContext, type ReactNode, useContext } from "react"

const DesktopScaleContext = createContext(defaultDesktopScale)

/** Establishes the ratio between physical browser pixels and Desktop pixels. */
export function DesktopScaleProvider({ children, scale }: Readonly<{ children: ReactNode, scale: number }>) {
    return <DesktopScaleContext.Provider value={scale}>{children}</DesktopScaleContext.Provider>
}

/** Returns the effective scale of the containing Desktop representation. */
export function useDesktopScale() {
    return useContext(DesktopScaleContext)
}

/** Converts one physical browser distance into the Desktop coordinate space. */
export function physicalToDesktopPixels(value: number, scale: number) {
    return value / scale
}
