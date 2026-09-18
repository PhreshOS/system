import { Surface, useAppearance, useThemedValue, type SurfaceProps } from "@phreshos/react-ui"
import Spinner from "./spinner"

type LoadingProps = Omit<SurfaceProps, "material">

/** A complete loading surface for unresolved content. */
export default function ({ className, style, ...props }: LoadingProps) {
    const background = useThemedValue(useAppearance().colors).background

    return <div

        className={`inset-0 z-10 ${className ?? ""}`}

        style={{ ...style, position: "absolute", borderRadius: style?.borderRadius ?? "inherit" }}

    >

        <div
            aria-hidden="true"
            style={{ position: "absolute", inset: 0, borderRadius: "inherit", backgroundColor: background }}
        />

        <Surface
            {...props}
            className="absolute inset-0 grid"
            style={{ borderRadius: "inherit" }}
        >

            <Spinner className="m-auto size-6" />

        </Surface>

    </div>
}
