import { Text, useAppearance, useScale } from "@phreshos/react-ui"

/**
 * A quiet line where a list has nothing to show, in the middle of the content: the content is a size
 * container, and the line fills its height less the content's padding above and below.
 */
export default function Empty({ children }: Readonly<{ children: string }>) {

    const space = useScale(useAppearance().spacing)

    return <Text tone="secondary" size="small" className="grid place-items-center text-center" style={{ minHeight: `calc(100cqh - ${space.large * 2}px)` }}>{children}</Text>
}
