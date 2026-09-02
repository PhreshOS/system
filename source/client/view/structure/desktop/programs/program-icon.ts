const icon = "icons/medium.png"

/** The one browser location used for a program's desktop representation. */
export default function programIcon(door: string, assetId: string) {

    return `${door}/${assetId}/${icon}`
}
