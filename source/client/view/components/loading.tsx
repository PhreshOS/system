import { type ComponentProps } from "react"
import Spinner from "./spinner"

const loadingBackground = "bg-white/10"

/** The shared treatment for content obscured by an unresolved system state. */
export const obscuredBackground = `${loadingBackground} backdrop-blur-md`

interface LoadingProps extends ComponentProps<"div"> {

    /** Whether content behind the loading layer is blurred. */
    blur?: boolean
}

/** A loading surface that obscures unresolved content, with blur by default. */
export default function ({ blur = true, className, ...props }: LoadingProps) {

    return <div

        className={`absolute inset-0 z-10 grid rounded-[inherit] ${blur ? obscuredBackground : loadingBackground} ${className ?? ""}`}

        {...props}

    >

        <Spinner className="m-auto size-6 text-slate-700" />

    </div>
}
