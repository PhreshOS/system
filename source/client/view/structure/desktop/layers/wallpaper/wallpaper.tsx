import { ApplicationContext } from "@client/view/contexts"
import { useEffect, useEffectEvent, useRef, useState, type ReactNode, type TransitionEvent } from "react"
import Loading from "@client/view/components/loading"
import { useReady } from "@libs/readiness"
import { wallpaperRequirement } from "../../../readiness-requirements"
import { usePreferences, useTiming } from "@phreshos/react-ui"
import { useReducedMotion } from "@libs/react-motion"
import { cssEasing, wallpaperKind, type AppearanceWallpapers, type ThemedValue, type WallpaperKind } from "@phreshos/core"

/** Where a wallpaper is shown. */
export type WallpaperPlace = keyof AppearanceWallpapers

type WallpaperSource = Readonly<{
    identity: string
    kind: WallpaperKind
    url: string
}>

type WallpaperLayers = Readonly<{
    displayed: WallpaperSource | null
    incoming: WallpaperSource | null
    switching: boolean
}>

/** Displays one completely loaded wallpaper source. */
export function WallpaperBackground({ place, wallpapers, onReady }: WallpaperBackgroundProps) {
    const application = ApplicationContext.useValue()
    const { theme } = usePreferences()
    const reducedMotion = useReducedMotion()
    const desired = resolveWallpaper(wallpapers[theme][place], application.doors.uploads)
    const other = resolveWallpaper(wallpapers[theme === "light" ? "dark" : "light"][place], application.doors.uploads)
    const [layers, setLayers] = useState<WallpaperLayers>({
        displayed: null,
        incoming: desired,
        switching: false
    })
    const current = useRef(layers)
    const frame = useRef<number | null>(null)

    current.current = layers

    const ready = useEffectEvent(() => onReady?.())

    useEffect(() => {
        // The other theme's picture too, so a change of theme shows at once.
        if (other.kind !== "image") return
        const image = new Image()
        image.src = other.url
    }, [other.url, other.kind])

    useEffect(() => {
        cancelSwitch(frame)
        setLayers(value => {
            if (value.displayed?.identity === desired.identity) {
                return value.incoming ? { displayed: value.displayed, incoming: null, switching: false } : value
            }

            if (value.incoming?.identity === desired.identity) return value

            return { displayed: value.displayed, incoming: desired, switching: false }
        })
    }, [desired.identity])

    useEffect(() => () => cancelSwitch(frame), [])

    function loaded(source: WallpaperSource) {
        const shown = current.current

        if (shown.incoming?.identity !== source.identity) return

        ready()

        if (!shown.displayed || reducedMotion) {
            setLayers({ displayed: source, incoming: null, switching: false })
            return
        }

        cancelSwitch(frame)
        frame.current = requestAnimationFrame(() => {
            frame.current = requestAnimationFrame(() => {
                frame.current = null
                setLayers(value => value.incoming?.identity === source.identity
                    ? { ...value, switching: true }
                    : value)
            })
        })
    }

    function failed(source: WallpaperSource) {
        if (current.current.incoming?.identity !== source.identity) return

        setLayers(value => value.incoming?.identity === source.identity
            ? { ...value, incoming: null, switching: false }
            : value)
        ready()
    }

    function transitionEnded(event: TransitionEvent<HTMLDivElement>, source: WallpaperSource) {
        if (event.propertyName !== "opacity" || layers.incoming?.identity !== source.identity || !layers.switching) return
        setLayers({ displayed: source, incoming: null, switching: false })
    }

    const incoming = layers.incoming

    return <>
        {layers.displayed && <WallpaperLayer
            key={layers.displayed.identity}
            source={layers.displayed}
            visible
        />}

        {incoming && <WallpaperLayer
            key={incoming.identity}
            source={incoming}
            visible={layers.switching}
            onLoad={() => loaded(incoming)}
            onError={() => failed(incoming)}
            onTransitionEnd={event => transitionEnded(event, incoming)}
        />}
    </>
}

function WallpaperLayer({ source, visible, onLoad, onError, onTransitionEnd }: Readonly<{
    source: WallpaperSource
    visible: boolean
    onLoad?: () => void
    onError?: () => void
    onTransitionEnd?: (event: TransitionEvent<HTMLDivElement>) => void
}>) {
    const transaction = useTiming()("change")
    const reducedMotion = useReducedMotion()
    const interactive = source.kind === "html" && visible

    return <div
        className={`absolute inset-0 ${interactive ? "pointer-events-auto" : "pointer-events-none"} ${visible ? "opacity-100" : "opacity-0"}`}
        style={{
            transitionDuration: reducedMotion ? "0ms" : String(transaction.duration) + "ms",
            transitionTimingFunction: cssEasing(transaction.easing),
            transitionProperty: "opacity"
        }}
        onTransitionEnd={onTransitionEnd}
    >
        {source.kind === "image" && <img
            aria-hidden="true"
            alt=""
            className="h-full w-full object-cover"
            draggable={false}
            src={source.url}
            onLoad={event => void event.currentTarget.decode().then(onLoad, onError)}
            onError={onError}
        />}

        {source.kind === "video" && <video
            aria-hidden="true"
            className="h-full w-full object-cover"
            src={source.url}
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
            onCanPlay={onLoad}
            onError={onError}
        />}

        {source.kind === "html" && <iframe
            className="h-full w-full border-0"
            src={source.url}
            title="Wallpaper"
            sandbox="allow-scripts"
            referrerPolicy="no-referrer"
            onLoad={onLoad}
            onError={onError}
        />}
    </div>
}

function resolveWallpaper(file: string, uploads: string): WallpaperSource {
    const kind = wallpaperKind(file) ?? "image"
    const path = kind === "html" ? `${uploads}/wallpaper/${encodeURIComponent(file)}` : `${uploads}/${encodeURIComponent(file)}`

    return { identity: `${kind}:${file}`, kind, url: path }
}

function cancelSwitch(frame: { current: number | null }) {
    if (frame.current === null) return

    cancelAnimationFrame(frame.current)
    frame.current = null
}

/** A complete surface whose content sits above one file-backed wallpaper. */
export function WallpaperStage({ place, wallpapers, children }: WallpaperStageProps) {
    const { theme } = usePreferences()
    const file = wallpapers[theme][place]
    const [readyFile, setReadyFile] = useState<string>()
    const ready = readyFile === file

    return <div className="relative isolate grid min-h-0">
        <WallpaperBackground place={place} wallpapers={wallpapers} onReady={() => setReadyFile(file)} />

        <div className="pointer-events-none relative z-1 grid min-h-0">
            {children}
        </div>

        {!ready && <Loading />}
        {ready && <ReadyWallpaper />}
    </div>
}

export function ReadyWallpaper() {
    useReady(wallpaperRequirement)

    return null
}

interface WallpaperStageProps {
    place: WallpaperPlace
    wallpapers: ThemedValue<AppearanceWallpapers>
    children: ReactNode
}

interface WallpaperBackgroundProps {
    place: WallpaperPlace
    wallpapers: ThemedValue<AppearanceWallpapers>
    onReady?: () => void
}
