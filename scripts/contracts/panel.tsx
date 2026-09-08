import assert from "node:assert/strict"
import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { standardAppearance } from "@phreshos/core"
import { AppearanceProvider } from "@phreshos/react-ui"
import CredentialsForm from "@client/view/structure/authentication/credentials-form"
import TaskbarSurface from "@client/view/structure/desktop/taskbar/taskbar-surface"
import Launcher from "@client/view/structure/desktop/taskbar/launcher/launcher"
import Window from "@client/view/structure/desktop/windows/window"

function markup(children: ReactNode) {
    return renderToStaticMarkup(<AppearanceProvider appearance={standardAppearance} theme="light">{children}</AppearanceProvider>)
}

function panel(html: string) {
    assert.equal(html.match(/data-surface-material=""/g)?.length, 2)
    assert.match(html, /grid-template-rows:auto minmax\(0, 1fr\)/)
    assert.match(html, /margin:6px;margin-top:0/)
}

const taskbar = markup(<TaskbarSurface label="Title" labelId="title"><button>Action</button></TaskbarSurface>)
panel(taskbar)
assert.match(taskbar, /<h2 id="title"/)
assert.match(taskbar, /<button>Action<\/button>/)

const window = markup(<Window icon="/icon.svg" title="Window"><iframe title="Content" /></Window>)
panel(window)
assert.match(window, /data-window-container/)
assert.match(window, /<iframe title="Content"/)
assert.doesNotMatch(window, /class="p-px"/)
assert.match(window, /data-surface-border=""[^>]*z-index:1/)

const bare = markup(<Window bare icon="/icon.svg" title="Bare"><iframe title="Content" /></Window>)
assert.doesNotMatch(bare, /data-surface-material/)
assert.doesNotMatch(bare, /grid-template-rows:auto minmax\(0, 1fr\)/)

const authentication = markup(<CredentialsForm title="Sign in" description="Welcome" submitLabel="Continue" passwordAutocomplete="current-password" pending={false} onSubmit={() => {}} />)
panel(authentication)
assert.equal(authentication.match(/<form\b/g)?.length, 1)
assert.match(authentication, /name="username"/)
assert.match(authentication, /name="password"/)
assert.match(authentication, /type="submit"/)

const launcher = markup(<Launcher label="Menu" trigger="Open">{() => <button>Action</button>}</Launcher>)
panel(launcher)
// Native popover visibility belongs to the outer host, not Panel's grid.
const popover = launcher.match(/<div[^>]*popover="auto"[^>]*>/)?.[0]
assert(popover)
assert.doesNotMatch(popover, /style=/)
assert.match(launcher, /popovertarget=/i)
