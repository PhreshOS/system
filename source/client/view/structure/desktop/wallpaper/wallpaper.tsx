import darkWallpaper from "@/assets/bundled/dark-wallpaper.png"
import lightWallpaper from "@/assets/bundled/light-wallpaper.png"
import { ApplicationContext } from "@client/view/contexts"
import { useEffect, useEffectEvent, useRef, useState, type ReactNode, type TransitionEvent } from "react"
import Loading from "@client/view/components/loading"
import { useReady } from "@libs/readiness"
import { useTheme } from "@phreshos/react-ui"

const bundledWallpapers = [darkWallpaper, lightWallpaper] as const

const wallpaperImages = new Map<string, HTMLImageElement>()

const wallpaperLoads = new Map<string, Promise<void>>()

type WallpaperLayers = Readonly<{
    displayed: string | null
    incoming: string | null
    switching: boolean
}>

/**
 * Displays one completely loaded wallpaper source.
 *
 * A filename asks for a served image and `null` selects the effective Theme's
 * bundled wallpaper. Both bundled sources remain preloaded so a Theme change
 * only replaces the source of this one visual layer.
 */
export function WallpaperBackground({ file, onReady }: WallpaperBackgroundProps) {

    const application = ApplicationContext.useValue()

    const theme = useTheme()

    const desired = file === null
        ? theme === "dark" ? darkWallpaper : lightWallpaper
        : `${application.doors.uploads}/${encodeURIComponent(file)}`

    const [layers, setLayers] = useState<WallpaperLayers>({
        displayed: null,
        incoming: null,
        switching: false
    })
    const current = useRef(layers)
    const frame = useRef<number | null>(null)

    current.current = layers

    const ready = useEffectEvent(() => onReady?.())
    const display = useEffectEvent((source: string) => {
        const shown = current.current

        if (!shown.displayed) {
            setLayers({ displayed: source, incoming: null, switching: false })
            return
        }

        if (shown.displayed === source && !shown.incoming) return

        if (frame.current !== null) cancelAnimationFrame(frame.current)
        setLayers({ displayed: shown.incoming ?? shown.displayed, incoming: source, switching: false })
        frame.current = requestAnimationFrame(() => {
            frame.current = requestAnimationFrame(() => {
                frame.current = null
                setLayers(value => value.incoming === source ? { ...value, switching: true } : value)
            })
        })
    })

    useEffect(() => () => {
        if (frame.current !== null) cancelAnimationFrame(frame.current)
    }, [])

    useEffect(() => {
        let active = true
        const desiredLoad = loadWallpaper(desired)
        const bundledLoads = bundledWallpapers.map(loadWallpaper)
        const loading = file === null
            ? Promise.allSettled(bundledLoads).then(() => desiredLoad)
            : desiredLoad

        for (const preload of bundledLoads) void preload.catch(() => undefined)

        loading.then(() => {
            if (!active) return
            display(desired)
            ready()
        }, () => {
            if (active) ready()
        })

        return () => { active = false }
    }, [desired, file])

    function transitionEnded(event: TransitionEvent<HTMLDivElement>, source: string) {
        if (event.propertyName !== "opacity" || layers.incoming !== source || !layers.switching) return
        setLayers({ displayed: source, incoming: null, switching: false })
    }

    const incoming = layers.incoming

    return <>

        {layers.displayed && <WallpaperLayer
            key={layers.displayed}
            source={layers.displayed}
            visible
        />}

        {incoming && <WallpaperLayer
            key={incoming}
            source={incoming}
            visible={layers.switching}
            onTransitionEnd={event => transitionEnded(event, incoming)}
        />}

    </>
}

function WallpaperLayer({ source, visible, onTransitionEnd }: {
    source: string
    visible: boolean
    onTransitionEnd?: (event: TransitionEvent<HTMLDivElement>) => void
}) {
    return <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 bg-cover bg-center bg-no-repeat transition-opacity duration-700 ease-out ${visible ? "opacity-100" : "opacity-0"}`}
        style={{ backgroundImage: `url(${source})` }}
        onTransitionEnd={onTransitionEnd}
    />
}

function loadWallpaper(source: string) {
    const existing = wallpaperLoads.get(source)

    if (existing) return existing

    const image = new Image()
    const loading = new Promise<void>((resolve, reject) => {
        const failed = () => {
            wallpaperImages.delete(source)
            wallpaperLoads.delete(source)
            reject(new Error(`The wallpaper could not be loaded: ${source}`))
        }

        image.onload = () => void image.decode().then(resolve, failed)
        image.onerror = failed
    })

    wallpaperImages.set(source, image)
    wallpaperLoads.set(source, loading)
    image.src = source

    return loading
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
