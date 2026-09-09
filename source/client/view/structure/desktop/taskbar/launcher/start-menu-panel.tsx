import { type ReactNode } from "react"
import { Surface, useAppearance, useResolveTheme, useScale } from "@phreshos/react-ui"
import logo from "@/assets/bundled/logo.png"

/** Start menu shell: one outer material and two independently scrolling halves. */
export default function StartMenuPanel({ labelId, version, left, right }: Readonly<{ labelId: string, version: string, left: ReactNode, right: ReactNode }>) {

    const appearance = useAppearance()

    const spacing = useScale(useResolveTheme(appearance.spacing)).small

    return <Surface style={{ display: "grid", gridTemplateRows: "auto minmax(0, 1fr)", minHeight: 0, maxHeight: "inherit", overflow: "hidden" }}>

        <header className="relative grid h-10 shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3.5 select-none">

            <img src={logo} alt="" draggable={false} className="size-4 rounded-sm object-contain" />

            <h2 id={labelId} className="m-0 truncate text-window-title font-medium">PhreshOS</h2>

            <span className="text-xs tabular-nums opacity-60" aria-label={`System version ${version}`}>v{version}</span>

        </header>

        <div className="grid min-h-0 grid-cols-2" style={{ gap: spacing, padding: spacing, paddingTop: 0 }}>

            <Surface className="min-h-0 min-w-0 overflow-hidden">{left}</Surface>

            <Surface className="min-h-0 min-w-0 overflow-hidden">{right}</Surface>

        </div>

    </Surface>
}
