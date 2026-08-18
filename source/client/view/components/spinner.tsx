import { ComponentProps } from "react"
import { useReducedMotion } from "@libs/react-motion"

export default function ({ className, children, ...props }: ComponentProps<"div">) {

    const reducedMotion = useReducedMotion()

    return <div

        role="status"

        className={`rounded-full border-2 border-current border-t-transparent ${reducedMotion ? "" : "animate-spin"} ${className ?? ""}`}

        {...props}

    >

        {children ?? <span className="sr-only">Loading</span>}

    </div>
}
