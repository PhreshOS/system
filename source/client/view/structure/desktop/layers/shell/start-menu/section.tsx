import { type ReactNode } from "react"
import { ScrollArea, Text, useAppearance, useScale } from "@phreshos/react-ui"

/** One titled list of the Start Menu, scrolling on its own, or a quiet line when it is empty. */
export default function Section({ label, count, empty, columns = 1, children }: Readonly<{
    label: string
    count: number
    empty: string
    /** Items laid out in this many equal columns. */
    columns?: number
    children: ReactNode
}>) {

    const space = useScale(useAppearance().spacing)

    return <div role="group" aria-label={label} className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)]">

        <Text tone="secondary" size="small" style={{ paddingInline: space.medium, paddingTop: space.medium, paddingBottom: space.medium - space.xsmall, fontWeight: 500 }}>{label} · {count}</Text>

        {count === 0

            ? <Text tone="secondary" size="small" className="grid place-items-center text-center" style={{ padding: space.large }}>{empty}</Text>

            : <ScrollArea className="h-full min-h-0">

                {/* The smallest step above the items keeps their edge clear of the scroll area's top. */}
                <div className="grid content-start" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: space.small, padding: space.medium, paddingTop: space.xsmall }}>{children}</div>

            </ScrollArea>}

    </div>
}
