import { PointerEvent as ReactPointerEvent, ReactNode } from "react"
import { motion } from "motion/react"
import { motionTransition } from "@client/view/appearance/motion"
import { Button, type ButtonColor, useAppearance, useThemedValue } from "@phreshos/react-ui"

/** The visible chrome above an ordinary window's content. */
export default function WindowHeader({ title, icon, active, whole, reducedMotion, stopping, onGrab, onMinimize, onMaximize, onClose }: WindowHeaderProps) {

    const appearance = useAppearance()

    const transition = motionTransition(appearance.transaction, reducedMotion)

    const foreground = useThemedValue(appearance.colors).foreground

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

        <div className="grid shrink-0 grid-flow-col auto-cols-max gap-1" onPointerDown={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}>

            {onMinimize && <Control label="Minimise" foreground={foreground} preventFocusOnPress onPress={onMinimize}>

                <path d="M1.5 7.5h7" />

            </Control>}

            {onMaximize && <Control label={whole ? "Restore" : "Fill"} foreground={foreground} onPress={onMaximize}>

                {whole

                    ? <path d="M1 4h5v5H1zM4 1h5v5H6.5" strokeWidth="1.3" strokeLinejoin="round" />

                    : <path d="M1.5 1.5h7v7h-7z" strokeWidth="1.3" strokeLinejoin="round" />}

            </Control>}

            {onClose && <Control label="Close" foreground={foreground} color="danger:base" preventFocusOnPress onPress={onClose} disabled={stopping}>

                <path d="M1.5 1.5 8.5 8.5M8.5 1.5 1.5 8.5" />

            </Control>}

        </div>

    </div>
}

function Control({ label, foreground, children, ...props }: ControlProps) {

    return <Button

        {...props}

        aria-label={label}

        size="xsmall"

        style={{ color: foreground }}

    >

        <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="size-2.5">

            {children}

        </svg>

    </Button>
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

interface ControlProps {

    label: string

    foreground: string

    color?: ButtonColor

    preventFocusOnPress?: boolean

    disabled?: boolean

    onPress: () => void

    children: ReactNode
}
