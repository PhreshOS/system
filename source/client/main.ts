import { displayName, name, version } from "@/package.json"
import doors from "@server/view/doors"
import view from "./view2/view"

view({ name, displayName, version, doors, document })
