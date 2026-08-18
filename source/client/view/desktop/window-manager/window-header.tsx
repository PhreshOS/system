import { ComponentProps, PointerEvent as ReactPointerEvent, ReactNode } from "react"

/** The visible chrome above an ordinary window's content. */
export default function WindowHeader({ title, icon, active, whole, reducedMotion, stopping, onGrab, onMinimize, onMaximize, onClose }: WindowHeaderProps) {

    return <header

        onPointerDown={onGrab}

        onDoubleClick={onMaximize}

        className="relative grid h-10 shrink-0 touch-none cursor-grab grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3.5 select-none active:cursor-grabbing"

    >

        <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-3">

            <img

                src={icon}

                alt=""

                draggable={false}

                className={`size-4 rounded-sm object-contain ${reducedMotion ? "" : "transition-opacity duration-200"} ${active ? "opacity-100" : "opacity-60"}`}

            />

            {/* Focus is said on the chrome and nowhere else. Content stays
                equally legible when another window owns the keyboard. */}
            <span className={`truncate text-window-title font-medium text-shadow-chrome ${reducedMotion ? "" : "transition-colors duration-200"} ${active ? "text-slate-800" : "text-slate-500"}`}>{title}</span>

        </div>

        <div className="grid shrink-0 grid-flow-col auto-cols-max gap-1" onPointerDown={event => event.stopPropagation()}>

            {onMinimize && <Control label="Minimise" reducedMotion={reducedMotion} focusOnPointerDown={false} onClick={onMinimize}>

                <path d="M1.5 7.5h7" />

            </Control>}

            {onMaximize && <Control label={whole ? "Restore" : "Fill"} reducedMotion={reducedMotion} onClick={onMaximize}>

                {whole

                    ? <path d="M1 4h5v5H1zM4 1h5v5H6.5" strokeWidth="1.3" strokeLinejoin="round" />

                    : <path d="M1.5 1.5h7v7h-7z" strokeWidth="1.3" strokeLinejoin="round" />}

            </Control>}

            {onClose && <Control label="Close" reducedMotion={reducedMotion} focusOnPointerDown={false} onClick={onClose} disabled={stopping} danger>

                <path d="M1.5 1.5 8.5 8.5M8.5 1.5 1.5 8.5" />

            </Control>}

        </div>

    </header>
}

// A pointer control acts on the press: click waits for the release, and that
// wait reads as lag on something meant to feel mechanical. Keyboard and
// assistive technology still use the button's native click activation.
function Control({ label, danger = false, focusOnPointerDown = true, reducedMotion, children, onClick, ...props }: ControlProps) {

    const reaction = danger

        ? "hover:border-rose-300/70 hover:bg-rose-500 hover:text-white active:bg-rose-600"

        : "hover:border-white/70 hover:bg-white/65 hover:text-slate-900 active:bg-white/80"

    return <button

        aria-label={label}

        onPointerDown={event => {

            event.stopPropagation()

            if (event.button !== 0) return

            if (focusOnPointerDown) event.currentTarget.focus({ preventScroll: true })

            // Minimise and close act without focusing their window. Preventing
            // the pointer's default focus keeps that action from raising it.
            else event.preventDefault()

            onClick?.()
        }}

        onClick={event => {

            event.stopPropagation()

            if (event.detail === 0) onClick?.()
        }}

        className={`grid size-6 place-items-center rounded-md border border-transparent bg-white/15 text-slate-600 outline-none shadow-sm disabled:pointer-events-none disabled:opacity-40 focus-visible:relative focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-sky-500 ${reducedMotion ? "" : "transition-colors duration-100 active:scale-95"} ${reaction}`}

        {...props}

    >

        <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="size-2.5">

            {children}

        </svg>

    </button>
}

interface WindowHeaderProps {

    title?: ReactNode

    icon: string

    active: boolean

    whole: boolean

    reducedMotion: boolean

    stopping: boolean

    onGrab: (event: ReactPointerEvent<HTMLElement>) => void

    onMinimize?: () => void

    onMaximize?: () => void

    onClose?: () => void
}

interface ControlProps extends Omit<ComponentProps<"button">, "onClick"> {

    label: string

    danger?: boolean

    focusOnPointerDown?: boolean

    reducedMotion: boolean

    onClick?: () => void
}
