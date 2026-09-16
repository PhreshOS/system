import assert from "node:assert/strict"
import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { defaultAppearance } from "@phreshos/core"
import { AppearanceProvider } from "@phreshos/react-ui"
import CredentialsForm from "@client/view/structure/authentication/credentials-form"
import TaskbarSurface, { taskbarSurfaceClassName } from "@client/view/structure/desktop/taskbar/taskbar-surface"
import Launcher from "@client/view/structure/desktop/taskbar/launcher/launcher"
import Window from "@client/view/structure/desktop/windows/window"
import StartMenuPanel from "@client/view/structure/desktop/taskbar/launcher/start-menu-panel"
import { ApplicationContext } from "@client/view/contexts"
import Application from "@client/core/application"
import { test } from "vitest"

test("panel contract", async () => {
  const application = new Application("phreshos", "Example System", "1.2.3", {
      link: "/link",
      proxy: "/proxy",
      storage: "/storage",
      uploads: "/uploads",
      program: "/program"
  })

  function markup(children: ReactNode) {
      return renderToStaticMarkup(<ApplicationContext.Provider value={application}>
          <AppearanceProvider appearance={defaultAppearance} preferences={{ theme: "light", animations: true }}>{children}</AppearanceProvider>
      </ApplicationContext.Provider>)
  }

  function panel(html: string, materials = 2) {
      assert.equal(html.match(/data-material=""/g)?.length, materials)
      assert.match(html, /grid-template-rows:auto minmax\(0, 1fr\)/)
      assert.match(html, /margin:6px;margin-top:0/)
  }

  const taskbar = markup(<TaskbarSurface label="Title" labelId="title"><button>Action</button></TaskbarSurface>)
  panel(taskbar)
  assert.match(taskbar, /<h2 id="title"/)
  assert.match(taskbar, /<button>Action<\/button>/)

  const window = markup(<Window icon="/icon.svg" title="Window"><iframe title="Content" /></Window>)
  assert.equal(window.match(/data-material=""/g)?.length, 1)
  assert.match(window, /grid-template-rows:auto minmax\(0, 1fr\)/)
  assert.match(window, /data-window-content="true"/)
  assert.doesNotMatch(window, /border-top:1px solid yellow/)
  assert.doesNotMatch(window, /margin:6px;margin-top:0/)
  assert.match(window, /data-window-container/)
  assert.match(window, /<iframe title="Content"/)
  assert.doesNotMatch(window, /class="p-px"/)

  const bare = markup(<Window bare icon="/icon.svg" title="Bare"><iframe title="Content" /></Window>)
  assert.doesNotMatch(bare, /data-material/)
  assert.doesNotMatch(bare, /grid-template-rows:auto minmax\(0, 1fr\)/)

  const authentication = markup(<CredentialsForm title="Sign in" description="Welcome" submitLabel="Continue" passwordAutocomplete="current-password" pending={false} onSubmit={() => {}} />)
  panel(authentication, 5)
  assert.equal(authentication.match(/<form\b/g)?.length, 1)
  assert.match(authentication, /name="username"/)
  assert.match(authentication, /name="password"/)
  assert.match(authentication, /placeholder="Username"/)
  assert.match(authentication, /placeholder="Password"/)
  assert.equal(authentication.match(/height:42px/g)?.length, 3)
  assert.doesNotMatch(authentication, /<label\b/)
  assert.match(authentication, /type="submit"/)
  assert.match(authentication, /<h2[^>]*>Example System<\/h2>/)
  assert.match(authentication, /System version 1.2.3/)
  assert.doesNotMatch(authentication, /backdrop-blur/)

  const launcher = markup(<Launcher label="Example System" trigger="Open">{(_close, labelId) => <StartMenuPanel labelId={labelId} name="Example System" version="1.2.3" left={<button>Programs</button>} right={<p>Processes</p>} footer={<input type="search" aria-label="Search Programs and Processes" />} />}</Launcher>)
  assert.equal(launcher.match(/data-material=""/g)?.length, 4)
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
  assert.doesNotMatch(popover, /\bgrid\b/)
  // Popovers and native dialogs share a non-clipping host for independently owned outer effects.
  assert(taskbarSurfaceClassName.split(" ").includes("overflow-visible"))

  const replacement = markup(<StartMenuPanel
      labelId="start-menu"
      name="Example System"
      version="1.2.3"
      left={<button>Programs</button>}
      right={<p>Processes</p>}
      footer={<input type="search" />}
      replacement={<iframe title="Client Start Menu" />}
  />)
  assert.equal(replacement.match(/data-material=""/g)?.length, 1)
  assert.match(replacement, /<iframe title="Client Start Menu"/)
  assert.doesNotMatch(replacement, /<button>Programs<\/button>/)
  assert.doesNotMatch(replacement, /<p>Processes<\/p>/)
  assert.doesNotMatch(replacement, /type="search"/)
}, 120_000)
