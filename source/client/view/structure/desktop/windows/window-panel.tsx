import { forwardRef, type ComponentProps, type ReactNode } from "react"

/** Structural header-and-content layout painted by its sibling Window surface. */
const WindowPanel = forwardRef<HTMLDivElement, ComponentProps<"div"> & { header: ReactNode }>(function WindowPanel(
    { header, children, style, ...properties },
    ref
) {
    return <div
        {...properties}
        ref={ref}
        style={{
            display: "grid",
            gridTemplateRows: header == null ? "minmax(0, 1fr)" : "auto minmax(0, 1fr)",
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
    </div>
})

export default WindowPanel
