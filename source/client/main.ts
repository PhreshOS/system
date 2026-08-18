import { displayName, name, version } from "@/package.json"
import doors from "@server/view/doors"
import view from "./view/view"

view({ name, displayName, version, document, doors })
