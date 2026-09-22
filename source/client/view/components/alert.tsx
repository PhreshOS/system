import { useAppearance, useThemedValue } from "@phreshos/react-ui"
import { ComponentProps } from "react"

export default function ({ style, ...props }: ComponentProps<"div">) {

    const color = useThemedValue(useAppearance().colors).danger

    // Form-wide failures cannot belong to one FieldError, but should retain
    // the same compact visual language rather than introducing another surface.
    return <div
        {...props}
        role="alert"
        style={{ fontSize: "0.92em", color, ...style }}
    />
}
