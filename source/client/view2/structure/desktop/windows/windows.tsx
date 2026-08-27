import { DesktopContext } from "../context"

export default function () {

    const { host } = DesktopContext.useValue()

    return <div

        ref={element => { host.windowSurfaceRef.current = element }}

        className="pointer-events-none relative z-2 min-h-0 bg-accent/20"

    />
}
