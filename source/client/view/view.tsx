import Appearance from "./appearance/appearance"
import Application, { type Doors } from "@client/core/application"
import { ApplicationContext } from "./contexts"
import Structure from "./structure/structure"
import client from "react-dom/client"
import logo from "@/assets/bundled/logo.png"
import { name, version } from "@/source/identity"

export default function (config: Config) {

    config.document.title = `${name} v${version}`

    const link = config.document.createElement("link")

    link.rel = "icon"

    link.href = logo

    config.document.head.appendChild(link)

    const application = new Application(config.doors)

    const root = client.createRoot(config.document.body)

    root.render(<ApplicationContext.Provider value={application}>

        <Appearance>

            <Structure />

        </Appearance>

    </ApplicationContext.Provider>)
}

export interface Config {

    doors: Doors

    document: Document
}
