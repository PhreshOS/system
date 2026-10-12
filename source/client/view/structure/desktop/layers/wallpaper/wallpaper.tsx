import { ApplicationContext } from "@client/view/contexts"
import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react"
import Loading from "@client/view/components/loading"
import { useReady } from "@libs/readiness"
import { wallpaperRequirement } from "../../../readiness-requirements"
import { usePreferences, useTiming } from "@phreshos/react-ui"
import { useReducedMotion } from "@libs/react-motion"
import { useDesktopFrameStyle } from "../../desktop-scale"
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
    const otherTheme = theme === "light" ? "dark" : "light"
    const desired = resolveWallpaper(wallpapers[theme][place], application.doors.uploads, theme, place)
    const other = resolveWallpaper(wallpapers[otherTheme][place], application.doors.uploads, otherTheme, place)
    const [layers, setLayers] = useState<WallpaperLayers>({
        displayed: null,
        incoming: desired,
        switching: false
    })
    const current = useRef(layers)
    const frame = useRef<number | null>(null)

    current.current = layers

    const ready = useEffectEvent(() => onReady?.())

    // The other Theme's wallpaper is read ahead, at the very address it is shown from, so a change of
    // Theme takes it from memory rather than the network. Nothing of it is shown or run: an image is
    // decoded, kept while it is the other Theme's; a video is only read. A page is read by a hidden
    // frame that runs no script, since browsers keep what frames open apart from what `fetch` reads.
    const prepared = useRef<HTMLImageElement | null>(null)
    const [pageRead, setPageRead] = useState<string | null>(null)

    useEffect(() => {
        if (other.kind === "html") return
        if (other.kind === "image") {
            const image = new Image()
            image.src = other.url
            void image.decode().catch(() => undefined)
            prepared.current = image
            return () => { prepared.current = null }
        }
        const reading = new AbortController()
        void fetch(other.url, { signal: reading.signal, priority: "low" })
            .then(response => response.body?.pipeTo(new WritableStream(), { signal: reading.signal }))
            .catch(() => undefined)
        return () => reading.abort()
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

        // Decoded is not yet drawn: a large picture takes a moment to paint. It is ready once the
        // frame that draws it has passed, two frames on, so what covered it never uncovers less.
        cancelSwitch(frame)

        if (!shown.displayed || reducedMotion) {
            setLayers({ displayed: source, incoming: null, switching: false })
            frame.current = requestAnimationFrame(() => {
                frame.current = requestAnimationFrame(() => {
                    frame.current = null
                    ready()
                })
            })
            return
        }

        frame.current = requestAnimationFrame(() => {
            frame.current = requestAnimationFrame(() => {
                frame.current = null
                ready()
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

    function shown(source: WallpaperSource) {
        if (layers.incoming?.identity !== source.identity || !layers.switching) return
        setLayers({ displayed: source, incoming: null, switching: false })
    }

    const incoming = layers.incoming

    return <>
        {other.kind === "html" && pageRead !== other.url && <iframe
            key={other.url}
            hidden
            aria-hidden="true"
            tabIndex={-1}
            title=""
            sandbox=""
            src={other.url}
            onLoad={() => setPageRead(other.url)}
        />}

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
            onShown={() => shown(incoming)}
        />}
    </>
}

/**
 * One wallpaper, faded in when it becomes visible. `onShown` tells when it fully shows: at the end of
 * its fade, or at once when no fade runs, as while the Theme changes and every transition is held
 * at no duration; the one it replaces can then go.
 */
function WallpaperLayer({ source, visible, onLoad, onError, onShown }: Readonly<{
    source: WallpaperSource
    visible: boolean
    onLoad?: () => void
    onError?: () => void
    onShown?: () => void
}>) {
    const transaction = useTiming()("change")
    const reducedMotion = useReducedMotion()
    const interactive = source.kind === "html" && visible
    const element = useRef<HTMLDivElement>(null)
    const frameStyle = useDesktopFrameStyle()
    const showing = useEffectEvent(() => onShown?.())

    // A frame after it becomes visible, a fade is running or none will: without one, it already shows.
    useEffect(() => {
        if (!visible) return
        const frame = requestAnimationFrame(() => { if (element.current?.getAnimations().length === 0) showing() })
        return () => cancelAnimationFrame(frame)
    }, [visible])

    return <div
        className={`absolute inset-0 ${interactive ? "pointer-events-auto" : "pointer-events-none"} ${visible ? "opacity-100" : "opacity-0"}`}
        style={{
            transitionDuration: reducedMotion ? "0ms" : String(transaction.duration) + "ms",
            transitionTimingFunction: cssEasing(transaction.easing),
            transitionProperty: "opacity"
        }}
        ref={element}
        onTransitionEnd={event => { if (event.target === event.currentTarget && event.propertyName === "opacity" && visible) onShown?.() }}
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
            className="border-0"
            style={frameStyle}
            src={source.url}
            title="Wallpaper"
            sandbox="allow-scripts"
            referrerPolicy="no-referrer"
            onLoad={onLoad}
            onError={onError}
        />}
    </div>
}

/**
 * Where one wallpaper is read from. An HTML page is told the Theme it is opened in, `?theme=light` or
 * `?theme=dark`, the Desktop's own and not the browser's, and the place it is shown in,
 * `&place=desktop` or `&place=signIn`, so one page can serve every place. A wallpaper is its file:
 * the same file in both Themes stays as it is when the Theme changes.
 */
function resolveWallpaper(file: string, uploads: string, theme: "light" | "dark", place: WallpaperPlace): WallpaperSource {
    const kind = wallpaperKind(file) ?? "image"

    if (kind === "html") return { identity: `html:${file}`, kind, url: `${uploads}/wallpaper/${encodeURIComponent(file)}?${new URLSearchParams({ theme, place })}` }

    return { identity: `${kind}:${file}`, kind, url: `${uploads}/${encodeURIComponent(file)}` }
}

function cancelSwitch(frame: { current: number | null }) {
    if (frame.current === null) return

    cancelAnimationFrame(frame.current)
    frame.current = null
}

/**
 * A complete surface whose content sits above one file-backed wallpaper. It waits once, for the
 * first wallpaper; a later one, such as another Theme's or one the owner chose, replaces it in place,
 * the one before staying until it can.
 */
export function WallpaperStage({ place, wallpapers, children }: WallpaperStageProps) {
    const [ready, setReady] = useState(false)

    return <div className="relative isolate grid min-h-0">
        <WallpaperBackground place={place} wallpapers={wallpapers} onReady={() => setReady(true)} />

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
