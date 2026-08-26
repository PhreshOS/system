import Appearance from "./appearance/appearance"
import Structure from "./structure/structure"
import Application, { type Doors } from "@client/core/application"
import { ApplicationContext } from "./contexts"
import client from "react-dom/client"
import logo from "@/assets/bundled/logo.png"

export default function (config: Config) {

    config.document.title = `${config.displayName} v${config.version}`

    const icon = config.document.createElement("link")

    icon.rel = "icon"

    icon.href = logo

    config.document.head.appendChild(icon)

    const application = new Application(config.name, config.displayName, config.version, config.doors)

    client.createRoot(config.document.body).render(

        <ApplicationContext.Provider value={application}>

            <Appearance>

                <Structure />

            </Appearance>

        </ApplicationContext.Provider>
    )
}

interface Config {

    name: string

    displayName: string

    version: string

    doors: Doors

    document: Document
}
