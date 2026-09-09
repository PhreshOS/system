import assert from "node:assert/strict"
import { renderToStaticMarkup } from "react-dom/server"
import { AppearanceProvider } from "@phreshos/react-ui"
import { standardAppearance } from "@phreshos/core"
import Program from "@server/core/link-manager/auth-manager/program-manager/program"
import SearchBar from "@client/view/structure/desktop/taskbar/launcher/search-bar"
import { matchesProcess, matchesProgram, searchTerms } from "@client/view/structure/desktop/taskbar/launcher/search"

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

const footer = renderToStaticMarkup(<AppearanceProvider appearance={standardAppearance} theme="light"><SearchBar query="notes" onChange={() => {}} username="test-owner" /></AppearanceProvider>)

assert.match(footer, /type="search"/)
assert.match(footer, /value="notes"/)
assert.match(footer, /aria-label="Search Programs and Processes"/)
assert.match(footer, /aria-label="Signed in as test-owner"/)
assert.match(footer, /^<div\b/)
assert.match(footer, /grid-cols-\[minmax\(0,1fr\)_auto\]/)
assert.match(footer, /style="gap:inherit"/)
assert.equal(footer.match(/data-surface-material=""/g)?.length, 2)
assert.doesNotMatch(footer, /<(?:main|section|article|aside|nav|header|footer)\b/)
const withoutUser = renderToStaticMarkup(<AppearanceProvider appearance={standardAppearance} theme="light"><SearchBar query="" onChange={() => {}} username={null} /></AppearanceProvider>)

assert.doesNotMatch(withoutUser, /Signed in as/)
assert.equal(withoutUser.match(/data-surface-material=""/g)?.length, 1)
