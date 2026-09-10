import { Button, type ButtonProps } from "@phreshos/react-ui"

/** A compact taskbar control whose contents define its meaning. */
export default function TaskbarButton({ small = false, ...props }: TaskbarButtonProps) {

    return <Button size={small ? "xsmall" : "small"} {...props} />
}

interface TaskbarButtonProps extends ButtonProps {

    small?: boolean
}
