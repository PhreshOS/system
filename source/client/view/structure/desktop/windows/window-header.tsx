import { ComponentProps, PointerEvent as ReactPointerEvent, ReactNode, useState } from "react"
import { motion } from "motion/react"
import { motionTransition } from "@client/view/appearance/motion"
import { useAppearance } from "@phreshos/react-ui"

const control = {
    base: { borderColor: "transparent", backgroundColor: "rgba(255, 255, 255, 0.15)", color: "#475569", scale: 1 },
    hover: { borderColor: "rgba(255, 255, 255, 0.7)", backgroundColor: "rgba(255, 255, 255, 0.65)", color: "#0f172a", scale: 1 },
    danger: { borderColor: "rgba(253, 164, 175, 0.7)", backgroundColor: "#f43f5e", color: "#ffffff", scale: 1 }
}

/** The visible chrome above an ordinary window's content. */
export default function WindowHeader({ title, icon, active, whole, reducedMotion, stopping, onGrab, onMinimize, onMaximize, onClose }: WindowHeaderProps) {

    const transition = motionTransition(useAppearance().transaction, reducedMotion)

    return <div

        onPointerDown={onGrab}

        onDoubleClick={onMaximize}

        className="relative grid h-10 shrink-0 touch-none cursor-grab grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3.5 select-none active:cursor-grabbing"

    >

        <motion.img

            src={icon}

            alt=""

            draggable={false}

            className="size-4 rounded-sm object-contain"

            initial={false}

            animate={{ opacity: active ? 1 : 0.6 }}

            transition={transition}

        />

        {/* Focus is said on the chrome and nowhere else. Content stays
            equally legible when another window owns the keyboard. */}
        <motion.span
            className="truncate text-window-title font-medium"
            initial={false}
            animate={{ opacity: active ? 1 : 0.6 }}
            transition={transition}
        >{title}</motion.span>

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

    </div>
}

// A pointer control acts on the press: click waits for the release, and that
// wait reads as lag on something meant to feel mechanical. Keyboard and
// assistive technology still use the button's native click activation.
function Control({ label, danger = false, focusOnPointerDown = true, reducedMotion, children, onClick, ...props }: ControlProps) {

    const [interaction, setInteraction] = useState<"base" | "hover" | "pressed">("base")

    const hover = danger ? control.danger : control.hover

    const pressed = {
        ...hover,
        backgroundColor: danger ? "#e11d48" : "rgba(255, 255, 255, 0.8)",
        scale: 0.95
    }

    const values = interaction === "pressed" ? pressed : interaction === "hover" ? hover : control.base

    return <motion.button

        {...props}

        aria-label={label}

        initial={false}

        animate={values}

            transition={motionTransition(useAppearance().transaction, reducedMotion)}

        onPointerEnter={() => {

            setInteraction("hover")
        }}

        onPointerLeave={() => {

            setInteraction("base")
        }}

        onPointerDown={event => {

            event.stopPropagation()

            if (event.button !== 0) return

            setInteraction("pressed")

            if (focusOnPointerDown) event.currentTarget.focus({ preventScroll: true })

            // Minimise and close act without focusing their window. Preventing
            // the pointer's default focus keeps that action from raising it.
            else event.preventDefault()

            onClick?.()
        }}

        onPointerUp={() => setInteraction("hover")}

        onPointerCancel={() => setInteraction("base")}

        onKeyDown={event => {

            if (event.key === "Enter" || event.key === " ") setInteraction("pressed")
        }}

        onKeyUp={event => {

            if (event.key === "Enter" || event.key === " ") setInteraction("base")
        }}

        onClick={event => {

            event.stopPropagation()

            if (event.detail === 0) onClick?.()
        }}

        className="grid size-6 place-items-center rounded-md border border-transparent bg-white/15 outline-none shadow-sm disabled:pointer-events-none disabled:opacity-40 focus-visible:relative focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-sky-500"

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

interface ControlProps extends Omit<ComponentProps<"button">, "onAnimationStart" | "onClick" | "onDrag" | "onDragEnd" | "onDragStart"> {

    label: string

    danger?: boolean

    focusOnPointerDown?: boolean

    reducedMotion: boolean

    onClick?: () => void
}
