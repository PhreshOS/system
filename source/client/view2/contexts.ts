import AuthManager from "@client/core/link-manager/auth-manager/auth-manager"
import LinkManager from "@client/core/link-manager/link-manager"
import Application from "@client/core/application"
import ReactContext from "@libs/react-context"

export const ApplicationContext = new ReactContext<Application>()

export const LinkManagerContext = new ReactContext<LinkManager>()

export const AuthManagerContext = new ReactContext<AuthManager>()
