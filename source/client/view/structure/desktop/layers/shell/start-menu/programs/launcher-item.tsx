import { Button, Text, useAppearance, useScale, type ButtonActionProps } from "@phreshos/react-ui"
import { type ReactNode } from "react"

/**
 * One Program in the Start Menu's grid: a small card on the Programs well,
 * flat in a light tint of the secondary color, like the catalog cards of the first-run Program,
 * its icon above its name in small text, cut short when it is long. The
 * description is its tooltip.
 */
export default function LauncherItem({ icon, description, children, ...props }: LauncherItemProps) {

    const space = useScale(useAppearance().spacing)

    // The cell carries the description as its tooltip; the card fills it.
    return <div className="grid min-w-0" title={description ?? undefined}><Button

        {...props}

        depth="flat"

        color="secondary:subtle"

        style={{ display: "grid", justifyItems: "center", alignContent: "start", rowGap: space.small, width: "100%", height: "auto", minWidth: 0, paddingBlock: space.medium, paddingInline: space.small }}

    >

        <img src={icon} alt="" draggable={false} style={{ width: space.xlarge, height: space.xlarge }} className="object-contain" />

        <Text size="small" className="w-full truncate text-center">{children}</Text>

    </Button></div>
}

export interface LauncherItemProps extends Omit<ButtonActionProps, "children" | "color" | "style"> {

    icon: string

    description?: string | null

    children: ReactNode
}
