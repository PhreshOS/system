import { type ComponentProps } from "react"
import Spinner from "./spinner"

/** The shared treatment for content obscured by an unresolved system state. */
export const obscuredBackground = "bg-white/10 backdrop-blur-md"

/** A loading surface that keeps the content behind it softly obscured. */
export default function ({ className, ...props }: ComponentProps<"div">) {

    return <div

        className={`absolute inset-0 z-10 grid rounded-[inherit] ${obscuredBackground} ${className ?? ""}`}

        {...props}

    >

        <Spinner className="m-auto size-6 text-slate-700" />

    </div>
}
