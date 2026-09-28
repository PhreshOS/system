import { Bot, Code, Globe, Layers, Settings2, SquareKanban, type LucideIcon } from "@phreshos/react-ui/icons"
import { Text, useAppearance, useScale } from "@phreshos/react-ui"
import type Program from "@client/core/link-manager/auth-manager/program-manager/program"

/**
 * Groups Programs by their first category, so each appears once, in the order
 * the categories first appear. A Program without a category is under "Other",
 * as in the first-run Program's catalog.
 */
export function categorized(programs: readonly Program[]) {

    const grouped = new Map<string, Program[]>()

    for (const program of programs) {

        const category = program.categories[0] ?? "Other"

        grouped.set(category, [...grouped.get(category) ?? [], program])
    }

    return [...grouped].map(([category, members]) => ({ category, members }))
}

/** An icon for each category a Program may declare; any other category takes a general one. */
const categoryIcons: Readonly<Record<string, LucideIcon>> = {
    System: Settings2,
    Internet: Globe,
    Productivity: SquareKanban,
    Development: Code,
    AI: Bot
}

/** A category's heading across the whole grid: its icon and its name. */
export function CategoryHeading({ category }: Readonly<{ category: string }>) {

    const space = useScale(useAppearance().spacing)

    const Icon = categoryIcons[category] ?? Layers

    return <Text tone="secondary" size="small" className="flex items-center" style={{ gridColumn: "1 / -1", gap: space.small, paddingTop: space.small, fontWeight: 500 }}>

        <Icon aria-hidden />{category}

    </Text>
}
