import Appearance from "./appearance/appearance"
import Structure from "./structure/structure"
import client from "react-dom/client"
import logo from "@/assets/bundled/logo.png"

export default function (config: Config) {

    config.document.title = `${config.displayName} v${config.version}`

    const icon = config.document.createElement("link")

    icon.rel = "icon"

    icon.href = logo

    config.document.head.appendChild(icon)

    const container = config.document.getElementById("root")

    if (!container) throw new Error("The Client root container is missing")

    client.createRoot(container).render(<Appearance>

        <Structure document={config.document} />

    </Appearance>)
}

interface Config {

    name: string

    displayName: string

    version: string

    document: Document
}
