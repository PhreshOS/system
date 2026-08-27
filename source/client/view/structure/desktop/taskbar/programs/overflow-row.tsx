import { ComponentProps, useId, useLayoutEffect, useRef, useState } from "react"
import { useReducedMotion } from "@libs/react-motion"

/** A horizontal row that reveals its own overflow without owning its items. */
export default function OverflowRow({ children, backwardLabel = "Scroll backward", forwardLabel = "Scroll forward", className, ...props }: OverflowRowProps) {

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

            const end = Math.max(0, view!.scrollWidth - view!.clientWidth)

            const offset = getComputedStyle(view!).direction === "rtl" ? -view!.scrollLeft : view!.scrollLeft

            const next = {

                // Compare natural content with the whole row, not the
                // viewport after controls take their places. That avoids
                // controls keeping themselves alive after content shrinks.
                overflowing: row!.scrollWidth > box!.clientWidth + 1,

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

    }, [])

    function scroll(direction: -1 | 1) {

        const view = viewport.current

        if (!view) return

        const inlineDirection = getComputedStyle(view).direction === "rtl" ? -1 : 1

        view.scrollBy({ left: inlineDirection * direction * view.clientWidth * 0.8, behavior: reducedMotion ? "auto" : "smooth" })
    }

    return <div ref={container} role="group" className={`flex min-w-0 items-center gap-1 ${className ?? ""}`} {...props}>

        {edges.overflowing && <ScrollButton label={backwardLabel} controls={viewportId} direction="backward" disabled={edges.start} reducedMotion={reducedMotion} onClick={() => scroll(-1)} />}

        <div id={viewportId} ref={viewport} className="-m-2 min-w-0 flex-1 overflow-x-auto p-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">

            <div ref={content} className="flex w-max min-w-full items-center gap-1.5">

                {children}

            </div>

        </div>

        {edges.overflowing && <ScrollButton label={forwardLabel} controls={viewportId} direction="forward" disabled={edges.end} reducedMotion={reducedMotion} onClick={() => scroll(1)} />}

    </div>
}

function ScrollButton({ label, controls, direction, disabled, reducedMotion, onClick }: ScrollButtonProps) {

    return <button

        type="button"

        aria-label={label}

        aria-controls={controls}

        disabled={disabled}

        onClick={onClick}

        className={`grid size-7 shrink-0 place-items-center rounded-lg border border-white/45 bg-white/55 text-slate-700 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-35 ${reducedMotion ? "" : "transition-colors hover:bg-white/80 active:scale-95"}`}

    >

        <svg aria-hidden="true" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="size-3 rtl:-scale-x-100">

            <path d={direction === "backward" ? "m7.5 2.5-3.5 3.5 3.5 3.5" : "m4.5 2.5 3.5 3.5-3.5 3.5"} />

        </svg>

    </button>
}

interface OverflowRowProps extends ComponentProps<"div"> {

    backwardLabel?: string

    forwardLabel?: string
}

interface ScrollButtonProps {

    label: string

    controls: string

    direction: "backward" | "forward"

    disabled: boolean

    reducedMotion: boolean

    onClick: () => void
}
