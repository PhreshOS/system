import Launcher from "./launcher/launcher"
import Programs from "./programs/programs"
import System from "./system/system"

export default function () {

    return <div className="relative z-4 grid h-[2.2rem] grid-cols-[auto_1fr_auto] gap-1.25 overflow-hidden rounded-lg bg-success/20 p-1.25">

        <Launcher />

        <Programs />

        <System />

    </div>
}
