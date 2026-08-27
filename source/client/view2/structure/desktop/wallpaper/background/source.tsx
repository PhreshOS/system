export default function ({ value, visible, loaded }: Properties) {

    if (value.type === "document") return <iframe

        src={value.source}

        title="Wallpaper"

        sandbox="allow-scripts"

        className={`absolute inset-0 size-full border-0 ${visible ? "" : "pointer-events-none opacity-0"}`}

        onLoad={loaded}

    />

    return <>

        <div

            aria-hidden="true"

            className={`pointer-events-none absolute inset-0 bg-cover bg-center bg-no-repeat ${visible ? "" : "opacity-0"}`}

            style={{ backgroundImage: `url(${value.source})` }}

        />

        {!visible && <img src={value.source} alt="" className="hidden" onLoad={loaded} />}

    </>
}

export interface WallpaperSource {

    identity: string

    source: string

    type: "image" | "document"
}

interface Properties {

    value: WallpaperSource

    visible: boolean

    loaded: () => void
}
