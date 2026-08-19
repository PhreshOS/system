import bundledWallpaper from "@/assets/bundled/wallpaper.jpg"
import { ApplicationContext } from "../contexts"
import { useMemo, useState, type ReactNode } from "react"
import Loading from "./loading"
import { useReady } from "@libs/readiness/main"

type WallpaperSource = Readonly<{
    key: string
    source: string
    html: boolean
}>

/**
 * Displays only a completely loaded wallpaper source.
 *
 * A filename asks for a new served wallpaper, `null` explicitly selects the
 * bundled wallpaper, and `undefined` retains the displayed source while a
 * different wallpaper owner prepares its representation.
 */
export function WallpaperBackground({ file, visible = true, onReady }: WallpaperBackgroundProps) {

    const application = ApplicationContext.useValue()

    const desired = useMemo<WallpaperSource | null>(() => {

        if (file === undefined) return null

        return file === null
            ? { key: "bundled", source: bundledWallpaper, html: false }
            : {
                key: `file:${file}`,
                source: `${application.doors.uploads}/${encodeURIComponent(file)}`,
                html: /\.html?$/i.test(file)
            }

    }, [application.doors.uploads, file])

    const [displayed, setDisplayed] = useState<WallpaperSource | null>(null)

    const sources = desired && desired.key !== displayed?.key

        ? displayed ? [displayed, desired] : [desired]

        : displayed ? [displayed] : desired ? [desired] : []

    function loaded(source: WallpaperSource) {

        if (source.key !== desired?.key) return

        setDisplayed(source)

        onReady?.()
    }

    return <>{sources.map(source => <WallpaperLayer

        key={source.key}

        source={source}

        visible={visible && source.key === displayed?.key}

        onLoad={() => loaded(source)}

    />)}</>
}

function WallpaperLayer({ source, visible, onLoad }: { source: WallpaperSource, visible: boolean, onLoad: () => void }) {

    if (source.html) return <iframe

        src={source.source}

        title="Wallpaper"

        sandbox="allow-scripts"

        className={`absolute inset-0 size-full border-0 ${visible ? "" : "pointer-events-none opacity-0"}`}

        onLoad={onLoad}

    />

    return <>

        <div

            aria-hidden="true"

            className={`pointer-events-none absolute inset-0 bg-cover bg-center bg-no-repeat ${visible ? "" : "opacity-0"}`}

            style={{ backgroundImage: `url(${source.source})` }}

        />

        {!visible && <img

            src={source.source}

            alt=""

            className="hidden"

            onLoad={onLoad}

        />}

    </>
}

/** A complete surface whose content sits above one file-backed wallpaper. */
export function WallpaperStage({ file, children }: WallpaperStageProps) {

    const [readyFile, setReadyFile] = useState<string | null>()

    const ready = readyFile === file

    return <div className="relative isolate grid min-h-0">

        <WallpaperBackground file={file} onReady={() => {

            setReadyFile(file)
        }} />

        <div className="relative z-1 grid min-h-0">

            {children}

        </div>

        {!ready && <Loading />}

        {ready && <ReadyWallpaper />}

    </div>
}

export function ReadyWallpaper() {

    useReady("wallpaper")

    return null
}

interface WallpaperStageProps {

    file: string | null

    children: ReactNode
}

interface WallpaperBackgroundProps {

    file: string | null | undefined

    visible?: boolean

    onReady?: () => void
}
