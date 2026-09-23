import assert from "node:assert/strict"
import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { defaultAppearance } from "@phreshos/core"
import { resolveRadius, UIProvider } from "@phreshos/react-ui"
import CredentialsForm from "@client/view/structure/authentication/credentials-form"
import ShellSurface, { shellSurfaceClassName } from "@client/view/structure/desktop/layers/shell/shell-surface"
import Window from "@client/view/structure/desktop/windows/window"
import StartMenuPanel from "@client/view/structure/desktop/layers/shell/start-menu/start-menu-panel"
import Taskbar from "@client/view/structure/desktop/layers/shell/taskbar/taskbar"
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
          <UIProvider appearance={defaultAppearance} preferences={{ theme: "light", animations: true }}>{children}</UIProvider>
      </ApplicationContext.Provider>)
  }

  function panel(html: string, materials = 2) {
      assert.equal(html.match(/data-material=""/g)?.length, materials)
      assert.match(html, /grid-template-rows:auto minmax\(0, 1fr\)/)
      assert.match(html, /margin:6px;margin-top:0/)
  }

  const shell = markup(<ShellSurface label="Title" labelId="title"><button>Action</button></ShellSurface>)
  panel(shell)
  assert.match(shell, /<h2 id="title"/)
  assert.match(shell, /<button>Action<\/button>/)

  const window = markup(<Window layer="window" icon="/icon.svg" title="Window"><iframe title="Content" /></Window>)
  assert.equal(window.match(/data-material=""/g)?.length, 1)
  assert.match(window, /grid-template-rows:auto minmax\(0, 1fr\)/)
  assert.match(window, /data-window-content="true"/)
  assert.doesNotMatch(window, /border-top:1px solid yellow/)
  assert.doesNotMatch(window, /margin:6px;margin-top:0/)
  assert.match(window, /data-window-container/)
  assert.match(window, /<iframe title="Content"/)
  assert.doesNotMatch(window, /class="p-px"/)
  const windowPanel = window.match(/<div style="([^"]*grid-template-rows:auto minmax\(0, 1fr\)[^"]*)">/)?.[1] ?? ""
  assert.match(windowPanel, /overflow:hidden/)
  assert.match(windowPanel, new RegExp(`border-radius:${resolveRadius("medium", defaultAppearance)}`))

  const bare = markup(<Window layer="over" icon="/icon.svg" title="Bare"><iframe title="Content" /></Window>)
  assert.doesNotMatch(bare, /data-material/)
  assert.doesNotMatch(bare, /grid-template-rows:auto minmax\(0, 1fr\)/)

  const authentication = markup(<CredentialsForm title="Sign in" description="Welcome" submitLabel="Continue" passwordAutocomplete="current-password" pending={false} onSubmit={() => {}} />)
  panel(authentication, 5)
  assert.equal(authentication.match(/<form\b/g)?.length, 1)
  assert.match(authentication, /<form[^>]*noValidate=""/)
  assert.match(authentication, /name="username"/)
  assert.match(authentication, /name="password"/)
  assert.match(authentication, /placeholder="Username"/)
  assert.match(authentication, /placeholder="Password"/)
  assert.doesNotMatch(authentication, /<label\b/)
  assert.equal(authentication.match(/height:42px/g)?.length, 3)
  assert.match(authentication, /type="submit"/)
  assert.match(authentication, /<h2[^>]*>Example System<\/h2>/)
  assert.match(authentication, /System version 1.2.3/)
  assert.doesNotMatch(authentication, /backdrop-blur/)

  const authenticationError = markup(<CredentialsForm title="Sign up" description="Welcome" submitLabel="Continue" passwordAutocomplete="new-password" pending={false}
      requirements={{ username: { minimumLength: 1, maximumLength: 64 }, password: { minimumLength: 8, maximumLength: 1024 } }}
      error={{ target: "password", message: "Use a stronger password." }} onSubmit={() => {}} />)
  assert.match(authenticationError, /<input(?=[^>]*name="password")(?=[^>]*aria-invalid="true")/)
  assert.match(authenticationError, /Use a stronger password\./)
  assert.match(authenticationError, /<button(?=[^>]*disabled="")(?=[^>]*type="submit")/)

  const authenticationFailure = markup(<CredentialsForm title="Sign in" description="Welcome" submitLabel="Continue" passwordAutocomplete="current-password" pending={false}
      error={{ target: "form", message: "The request failed." }} onSubmit={() => {}} />)
  assert.match(authenticationFailure, /role="alert"/)
  assert.match(authenticationFailure, /The request failed\./)

  const launcher = markup(<StartMenuPanel labelId="start-menu-label" name="Example System" version="1.2.3" left={<button>Programs</button>} right={<p>Processes</p>} footer={<input type="search" aria-label="Search Programs and Processes" />} />)
  assert.equal(launcher.match(/data-material=""/g)?.length, 3)
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
  // Independent Shell overlays share a non-clipping host for outer effects.
  assert(shellSurfaceClassName.split(" ").includes("overflow-visible"))

  const taskbar = markup(<Taskbar
      leading={<button>Start</button>}
      trailing={<button>Sign out</button>}
      taskbar={{ position: "bottom", size: 44 }}
      spacing={8}
  ><button>Window</button></Taskbar>)
  assert.match(taskbar, /role="toolbar"/)
  assert.match(taskbar, /aria-label="Taskbar"/)
  assert.match(taskbar, /aria-orientation="horizontal"/)

}, 120_000)
