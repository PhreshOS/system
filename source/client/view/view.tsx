import Appearance from "./appearance/appearance"
import Application, { type Doors } from "@client/core/application"
import { ApplicationContext } from "./contexts"
import Desktop from "./desktop/desktop"
import client from "react-dom/client"
import logo from "@/assets/bundled/logo.png"

export default function (config: Config) {

    config.document.title = `${config.displayName} v${config.version}`

    const link = config.document.createElement("link")

    link.rel = "icon"

    link.href = logo

    config.document.head.appendChild(link)

    const application = new Application(config.name, config.displayName, config.version, config.doors)

    const root = client.createRoot(config.document.body)

    root.render(<ApplicationContext.Provider value={application}>

        <Appearance>

            <Desktop />

        </Appearance>

    </ApplicationContext.Provider>)
}

export interface Config {

    doors: Doors

    name: string

    displayName: string

    version: string

    document: Document
}
