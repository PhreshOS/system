import logo from "@/assets/bundled/logo.png"

/** The System identity header shared by System-owned panels. */
export default function SystemHeader({ labelId, name, version }: Readonly<{

    labelId?: string

    name: string

    version: string
}>) {

    return <div className="relative grid h-10 shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3.5 select-none">

        <img src={logo} alt="" draggable={false} className="size-4 rounded-sm object-contain" />

        <h2 id={labelId} className="m-0 truncate text-window-title font-medium">{name}</h2>

        <span className="text-xs tabular-nums opacity-60" aria-label={`System version ${version}`}>v{version}</span>

    </div>
}
