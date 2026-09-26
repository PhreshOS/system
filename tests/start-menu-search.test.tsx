import assert from "node:assert/strict"
import { renderToStaticMarkup } from "react-dom/server"
import { UIProvider } from "@phreshos/react-ui"
import { defaultAppearance } from "@phreshos/core"
import Program from "@server/core/link-manager/auth-manager/program-manager/program"
import SearchBar from "@client/view/structure/desktop/layers/shell/start-menu/search-bar"
import { matchesProcess, matchesProgram, searchTerms } from "@client/view/structure/desktop/layers/shell/start-menu/search"
import { test } from "vitest"

test("start menu search contract", async () => {
  const program = new Program({
      identity: "test-editor",
      name: "Note Studio",
      description: "Write and organize documents",
      categories: ["Productivity"],
      keywords: ["markdown", "notes"],
      client: { location: "." }
  }).record()

  assert.deepEqual(program.categories, ["Productivity"])
  assert.deepEqual(program.keywords, ["markdown", "notes"])
  const empty = new Program({ identity: "empty", client: { location: "." } }).record()

  assert.deepEqual(empty.categories, [])
  assert.deepEqual(empty.keywords, [])
  assert.deepEqual(searchTerms("  NOTE\tstudio  "), ["note", "studio"])

  for (const query of ["", "   ", "NOTE", "productivity", "markdown", "documents", "studio productivity markdown"]) {
      assert(matchesProgram(program, searchTerms(query)), query)
  }

  assert(!matchesProgram(program, searchTerms("missing")))
  assert(!matchesProgram(program, searchTerms("studio missing")))
  assert(matchesProcess("daily draft", undefined, searchTerms("DAILY draft")))
  assert(matchesProcess(null, program, searchTerms("markdown productivity")))
  assert(matchesProcess("daily draft", program, searchTerms("documents")))
  assert(matchesProcess(null, undefined, searchTerms("")))
  assert(!matchesProcess(null, undefined, searchTerms("notes")))
  assert(!matchesProcess("daily draft", program, searchTerms("missing")))

  const footer = renderToStaticMarkup(<UIProvider appearance={defaultAppearance} preferences={{ theme: "light", animations: true }}><SearchBar query="notes" onChange={() => {}} /></UIProvider>)

  assert.match(footer, /<div class="react-aria-TextField"/)
  assert.match(footer, /<input\b/)
  assert.match(footer, /value="notes"/)
  assert.match(footer, /aria-label="Search Programs and Processes"/)
  assert.equal(footer.match(/class="[^"]*phreshos-surface[^"]*"/g)?.length, 1)
  assert.doesNotMatch(footer, /<(?:main|section|article|aside|nav|header|footer)\b/)
  assert.doesNotMatch(footer, /Signed in as/)
}, 120_000)
