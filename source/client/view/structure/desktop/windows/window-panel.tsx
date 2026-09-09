import { forwardRef, type ReactNode } from "react"
import { Surface, type SurfaceProps } from "@phreshos/react-ui"

/** Temporary standard-window test: header and unpadded content, without an inner Surface. */
const WindowPanel = forwardRef<HTMLDivElement, SurfaceProps & { header: ReactNode }>(function WindowPanel(
    { header, children, style, ...properties },
    ref
) {
    return <Surface
        {...properties}
        ref={ref}
        style={{
            display: "grid",
            gridTemplateRows: "auto minmax(0, 1fr)",
            minWidth: 0,
            minHeight: 0,
            overflow: "hidden",
            ...style
        }}
    >
        {header}
        <div data-window-content style={{ position: "relative", minWidth: 0, minHeight: 0, overflow: "hidden" }}>
            {children}
        </div>
    </Surface>
})

export default WindowPanel
