import { displayName, name, version } from "@/package.json"
import doors from "@server/view/http/doors"
import view from "./view/view"

view({ name, displayName, version, doors, document })
