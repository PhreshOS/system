import { ComponentProps, useId, useLayoutEffect, useRef, useState } from "react"
import { useReducedMotion } from "@libs/react-motion"
import { Button } from "@phreshos/react-ui"

/** A Taskbar-axis list that reveals its own overflow without owning its items. */
export default function OverflowRow({ children, orientation = "horizontal", backwardLabel = "Scroll backward", forwardLabel = "Scroll forward", className, ...props }: OverflowRowProps) {

    const reducedMotion = useReducedMotion()

    const container = useRef<HTMLDivElement>(null)

    const viewport = useRef<HTMLDivElement>(null)

    const content = useRef<HTMLDivElement>(null)

    const viewportId = useId()

    const [edges, setEdges] = useState({ overflowing: false, start: true, end: true })

    useLayoutEffect(function () {

        const box = container.current

        const view = viewport.current

        const row = content.current

        if (!box || !view || !row) return

        function measure() {

            const horizontal = orientation === "horizontal"

            const end = Math.max(0, horizontal ? view!.scrollWidth - view!.clientWidth : view!.scrollHeight - view!.clientHeight)

            const offset = horizontal
                ? getComputedStyle(view!).direction === "rtl" ? -view!.scrollLeft : view!.scrollLeft
                : view!.scrollTop

            const next = {

                // Compare natural content with the whole row, not the
                // viewport after controls take their places. That avoids
                // controls keeping themselves alive after content shrinks.
                overflowing: horizontal ? row!.scrollWidth > box!.clientWidth + 1 : row!.scrollHeight > box!.clientHeight + 1,

                start: offset <= 1,

                end: offset >= end - 1
            }

            setEdges(current => current.overflowing === next.overflowing && current.start === next.start && current.end === next.end ? current : next)
        }

        const observer = new ResizeObserver(measure)

        observer.observe(box)

        observer.observe(view)

        observer.observe(row)

        view.addEventListener("scroll", measure, { passive: true })

        measure()

        return () => {

            observer.disconnect()

            view.removeEventListener("scroll", measure)
        }

    }, [orientation])

    function scroll(direction: -1 | 1) {

        const view = viewport.current

        if (!view) return

        if (orientation === "vertical") {

            view.scrollBy({ top: direction * view.clientHeight * 0.8, behavior: reducedMotion ? "auto" : "smooth" })

            return
        }

        const inlineDirection = getComputedStyle(view).direction === "rtl" ? -1 : 1

        view.scrollBy({ left: inlineDirection * direction * view.clientWidth * 0.8, behavior: reducedMotion ? "auto" : "smooth" })
    }

    const vertical = orientation === "vertical"

    return <div ref={container} role="group" className={`flex min-h-0 min-w-0 items-center gap-1 ${vertical ? "flex-col" : ""} ${className ?? ""}`} {...props}>

        {edges.overflowing && <ScrollButton label={backwardLabel} controls={viewportId} direction="backward" orientation={orientation} disabled={edges.start} onClick={() => scroll(-1)} />}

        <div id={viewportId} ref={viewport} className={`-m-2 min-h-0 min-w-0 flex-1 p-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${vertical ? "overflow-y-auto" : "overflow-x-auto"}`}>

            <div ref={content} className={`flex items-center gap-1.5 ${vertical ? "h-max min-h-full flex-col" : "w-max min-w-full"}`}>

                {children}

            </div>

        </div>

        {edges.overflowing && <ScrollButton label={forwardLabel} controls={viewportId} direction="forward" orientation={orientation} disabled={edges.end} onClick={() => scroll(1)} />}

    </div>
}

function ScrollButton({ label, controls, direction, orientation, disabled, onClick }: ScrollButtonProps) {

    return <Button
        aria-label={label}
        aria-controls={controls}
        disabled={disabled}
        onPress={onClick}
        size="xsmall"
        className="shrink-0"
        style={{ inlineSize: 28, blockSize: 28, paddingInline: 0 }}

    >

        <svg aria-hidden="true" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={`size-3 ${orientation === "vertical" ? "rotate-90" : "rtl:-scale-x-100"}`}>

            <path d={direction === "backward" ? "m7.5 2.5-3.5 3.5 3.5 3.5" : "m4.5 2.5 3.5 3.5-3.5 3.5"} />

        </svg>

    </Button>
}

interface OverflowRowProps extends ComponentProps<"div"> {

    orientation?: "horizontal" | "vertical"

    backwardLabel?: string

    forwardLabel?: string
}

interface ScrollButtonProps {

    label: string

    controls: string

    direction: "backward" | "forward"

    orientation: "horizontal" | "vertical"

    disabled: boolean

    onClick: () => void
}
