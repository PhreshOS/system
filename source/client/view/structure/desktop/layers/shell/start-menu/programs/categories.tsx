import { Bot, Code, Globe, Layers, Settings2, SquareKanban, type LucideIcon } from "@phreshos/react-ui/icons"
import type Program from "@client/core/link-manager/auth-manager/program-manager/program"

/** The category a Program is listed under: its first, or "Other" without one, as in the first-run Program's catalog. */
export function categoryOf(program: Pick<Program, "categories">) {

    return program.categories[0] ?? "Other"
}

/** Each category with how many Programs it holds, in the order the categories first appear. */
export function categories(programs: readonly Pick<Program, "categories">[]) {

    const counted = new Map<string, number>()

    for (const program of programs) counted.set(categoryOf(program), (counted.get(categoryOf(program)) ?? 0) + 1)

    return [...counted].map(([category, count]) => ({ category, count }))
}

/** An icon for each category a Program may declare; any other category takes a general one. */
const categoryIcons: Readonly<Record<string, LucideIcon>> = {
    System: Settings2,
    Internet: Globe,
    Productivity: SquareKanban,
    Development: Code,
    AI: Bot
}

export function categoryIcon(category: string): LucideIcon {

    return categoryIcons[category] ?? Layers
}
