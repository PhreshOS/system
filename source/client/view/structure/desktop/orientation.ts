import { useEffect, useState } from "react"

/** Whether the screen showing this Desktop is taller than it is wide; follows the screen as it turns or resizes. */
export function usePortrait() {

    const [portrait, setPortrait] = useState(() => typeof window !== "undefined" && window.innerHeight > window.innerWidth)

    useEffect(function () {

        const follow = () => setPortrait(window.innerHeight > window.innerWidth)

        window.addEventListener("resize", follow)

        return () => window.removeEventListener("resize", follow)

    }, [])

    return portrait
}
