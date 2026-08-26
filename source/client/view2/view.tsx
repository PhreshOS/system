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

    client.createRoot(config.document.body).render(<Appearance>

        <Structure />

    </Appearance>)
}

interface Config {

    name: string

    displayName: string

    version: string

    document: Document
}
