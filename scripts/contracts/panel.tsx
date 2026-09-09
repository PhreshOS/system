import assert from "node:assert/strict"
import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { standardAppearance } from "@phreshos/core"
import { AppearanceProvider } from "@phreshos/react-ui"
import CredentialsForm from "@client/view/structure/authentication/credentials-form"
import TaskbarSurface, { taskbarSurfaceClassName } from "@client/view/structure/desktop/taskbar/taskbar-surface"
import Launcher from "@client/view/structure/desktop/taskbar/launcher/launcher"
import Window from "@client/view/structure/desktop/windows/window"
import StartMenuPanel from "@client/view/structure/desktop/taskbar/launcher/start-menu-panel"

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
assert.equal(window.match(/data-surface-material=""/g)?.length, 1)
assert.match(window, /grid-template-rows:auto minmax\(0, 1fr\)/)
assert.match(window, /data-window-content="true"/)
assert.doesNotMatch(window, /border-top:1px solid yellow/)
assert.doesNotMatch(window, /margin:6px;margin-top:0/)
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

const launcher = markup(<Launcher label="Example System" trigger="Open">{(_close, labelId) => <StartMenuPanel labelId={labelId} name="Example System" version="1.2.3" left={<button>Programs</button>} right={<p>Processes</p>} footer={<input type="search" aria-label="Search Programs and Processes" />} />}</Launcher>)
assert.equal(launcher.match(/data-surface-material=""/g)?.length, 3)
assert.match(launcher, /grid-cols-2/)
assert.match(launcher, /grid-template-rows:auto minmax\(0, 1fr\);min-height:0/)
assert.match(launcher, /grid-template-rows:minmax\(0, 1fr\) auto;gap:8px;padding:8px;padding-top:0/)
assert.match(launcher, /grid-cols-2" style="gap:inherit"/)
assert.match(launcher, /<button>Programs<\/button>/)
assert.match(launcher, /<p>Processes<\/p>/)
assert.match(launcher, /<h2[^>]*>Example System<\/h2>/)
assert.match(launcher, /System version 1.2.3/)
assert.match(launcher, /type="search"/)
assert.doesNotMatch(launcher, /<(?:main|section|article|aside|nav|header|footer)\b/)
assert.match(launcher, /size-4 rounded-sm object-contain/)
// Native popover visibility belongs to the outer host, not Panel's grid.
const popover = launcher.match(/<div[^>]*popover="auto"[^>]*>/)?.[0]
assert(popover)
assert.match(popover, /overflow-visible/)
// Popovers and native dialogs share a non-clipping host for Surface shadows.
assert(taskbarSurfaceClassName.split(" ").includes("overflow-visible"))
assert.doesNotMatch(popover, /style=/)
assert.match(launcher, /popovertarget=/i)
