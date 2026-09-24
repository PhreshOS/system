import { Surface, type SurfaceProps } from "@phreshos/react-ui"
import Spinner from "./spinner"

type LoadingProps = Omit<SurfaceProps, "material">

/** A complete loading surface for unresolved content. */
export default function ({ className, style, children, ...props }: LoadingProps) {
    const described = children !== undefined

    return <Surface

        {...props}

        className={`inset-0 z-10 grid ${className ?? ""}`}

        style={{ ...style, position: "absolute", borderRadius: style?.borderRadius ?? "inherit" }}

    >

        <div className="m-auto grid justify-items-center gap-3" role={described ? "status" : undefined}>

            <Spinner aria-hidden={described ? true : undefined} className="size-6" />

            {described && <span data-loading-message className="text-sm opacity-60">{children}</span>}

        </div>

    </Surface>
}
