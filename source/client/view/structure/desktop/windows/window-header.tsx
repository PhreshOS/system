import { ComponentProps, PointerEvent as ReactPointerEvent, ReactNode } from "react"
import { motion } from "motion/react"
import { motionDuration, motionDurations, motionEase } from "../../../appearance/motion"

/** The visible chrome above an ordinary window's content. */
export default function WindowHeader({ title, icon, active, whole, reducedMotion, stopping, onGrab, onMinimize, onMaximize, onClose }: WindowHeaderProps) {

    const feedback = {
        duration: reducedMotion ? 0 : motionDuration(motionDurations.feedback),
        ease: motionEase("ease-out")
    }

    return <header

        onPointerDown={onGrab}

        onDoubleClick={onMaximize}

        className="relative grid h-10 shrink-0 touch-none cursor-grab grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3.5 select-none active:cursor-grabbing"

    >

        <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-3">

            <motion.img

                src={icon}

                alt=""

                draggable={false}

                className="size-4 rounded-sm object-contain"

                initial={false}

                animate={{ opacity: active ? 1 : 0.6 }}

                transition={feedback}

            />

            {/* Focus is said on the chrome and nowhere else. Content stays
                equally legible when another window owns the keyboard. */}
            <motion.span
                className="truncate text-window-title font-medium"
                initial={false}
                animate={{ color: active ? "#1e293b" : "#64748b" }}
                transition={feedback}
            >{title}</motion.span>

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

    const base = { borderColor: "transparent", backgroundColor: "rgba(255, 255, 255, 0.15)", color: "#475569", scale: 1 }

    const hover = danger

        ? { borderColor: "rgba(253, 164, 175, 0.7)", backgroundColor: "#f43f5e", color: "#ffffff", scale: 1 }

        : { borderColor: "rgba(255, 255, 255, 0.7)", backgroundColor: "rgba(255, 255, 255, 0.65)", color: "#0f172a", scale: 1 }

    const pressed = { ...hover, backgroundColor: danger ? "#e11d48" : "rgba(255, 255, 255, 0.8)", scale: 0.95 }

    return <motion.button

        {...props}

        aria-label={label}

        initial={false}

        animate={base}

        whileHover={hover}

        whileTap={pressed}

        transition={{
            duration: reducedMotion ? 0 : motionDuration(motionDurations.control),
            ease: motionEase("ease-out")
        }}

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

        className="grid size-6 place-items-center rounded-md border border-transparent bg-white/15 text-slate-600 outline-none shadow-sm disabled:pointer-events-none disabled:opacity-40 focus-visible:relative focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-sky-500"

    >

        <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="size-2.5">

            {children}

        </svg>

    </motion.button>
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

interface ControlProps extends Omit<ComponentProps<typeof motion.button>, "children" | "onClick"> {

    label: string

    children: ReactNode

    danger?: boolean

    focusOnPointerDown?: boolean

    reducedMotion: boolean

    onClick?: () => void
}
