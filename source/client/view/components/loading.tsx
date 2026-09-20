import { Surface, type SurfaceProps } from "@phreshos/react-ui"
import Spinner from "./spinner"

type LoadingProps = Omit<SurfaceProps, "material">

/** A complete loading surface for unresolved content. */
export default function ({ className, style, ...props }: LoadingProps) {
    return <Surface

        {...props}

        className={`inset-0 z-10 grid ${className ?? ""}`}

        style={{ ...style, position: "absolute", borderRadius: style?.borderRadius ?? "inherit" }}

    >

        <Spinner className="m-auto size-6" />

    </Surface>
}
