import ReactContext from "@libs/react-context"
import { type ClientHost } from "@client/view/components/desktop-host/client-host"
import { type DesktopWindows } from "@client/view/components/window-manager/window-manager"

export const DesktopContext = new ReactContext<DesktopEnvironment>()

interface DesktopEnvironment {

    host: ClientHost

    windows: DesktopWindows
}
