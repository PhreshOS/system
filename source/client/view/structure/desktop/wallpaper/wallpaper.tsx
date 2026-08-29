import darkWallpaper from "@/assets/bundled/dark-wallpaper.png"
import lightWallpaper from "@/assets/bundled/light-wallpaper.png"
import { ApplicationContext } from "../../../contexts"
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import Loading from "../../../components/loading"
import { useReady } from "@libs/readiness/main"
import { useTheme } from "@phreshos/react-ui"

type WallpaperSource = Readonly<{
    key: string
    source: string
}>

/**
 * Displays only a completely loaded wallpaper source.
 *
 * A filename asks for a served image and `null` selects the effective Theme's
 * bundled wallpaper. The previous loaded source stays visible until its
 * replacement is ready.
 */
export function WallpaperBackground({ file, onReady }: WallpaperBackgroundProps) {

    const application = ApplicationContext.useValue()

    const theme = useTheme()

    const desired = useMemo<WallpaperSource>(() => {
        return file === null
            ? {
                key: `bundled:${theme}`,
                source: theme === "dark" ? darkWallpaper : lightWallpaper
            }
            : {
                key: `file:${file}`,
                source: `${application.doors.uploads}/${encodeURIComponent(file)}`
            }

    }, [application.doors.uploads, file, theme])

    const [displayed, setDisplayed] = useState<WallpaperSource | null>(null)
    const [previous, setPrevious] = useState<WallpaperSource | null>(null)
    const loadedSources = useRef(new Set<string>())
    const transition = useRef<number | null>(null)

    useEffect(() => () => {
        if (transition.current !== null) clearTimeout(transition.current)
    }, [])

    const sources = distinct([previous, displayed, desired])

    useEffect(() => {
        if (loadedSources.current.has(desired.key)) display(desired)
    }, [desired])

    function loaded(source: WallpaperSource) {
        loadedSources.current.add(source.key)

        display(source)
    }

    function display(source: WallpaperSource) {
        if (source.key !== desired.key) return

        if (source.key === displayed?.key) {
            onReady?.()
            return
        }

        if (transition.current !== null) clearTimeout(transition.current)

        setPrevious(displayed)
        setDisplayed(source)
        onReady?.()

        if (displayed) {
            transition.current = window.setTimeout(() => {
                setPrevious(null)
                transition.current = null
            }, 700)
        }
    }

    function failed(source: WallpaperSource) {
        if (source.key === desired.key) onReady?.()
    }

    return <>{sources.map(source => <WallpaperLayer

        key={source.key}

        source={source}

        visible={source.key === displayed?.key}

        transitioning={previous !== null}

        onLoad={() => loaded(source)}

        onError={() => failed(source)}

    />)}</>
}

function distinct(sources: readonly (WallpaperSource | null)[]) {
    const keys = new Set<string>()

    return sources.filter((source): source is WallpaperSource => {
        if (!source || keys.has(source.key)) return false
        keys.add(source.key)
        return true
    })
}

function WallpaperLayer({ source, visible, transitioning, onLoad, onError }: {
    source: WallpaperSource
    visible: boolean
    transitioning: boolean
    onLoad: () => void
    onError: () => void
}) {
    return <>

        <div

            aria-hidden="true"

            className={`pointer-events-none absolute inset-0 bg-cover bg-center bg-no-repeat ${transitioning ? "transition-opacity duration-700 ease-out" : ""} ${visible ? "opacity-100" : "opacity-0"}`}

            style={{ backgroundImage: `url(${source.source})` }}

        />

        <img

            src={source.source}

            alt=""

            className="hidden"

            onLoad={onLoad}

            onError={onError}

        />

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

    file: string | null

    onReady?: () => void
}
