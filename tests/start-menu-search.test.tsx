import assert from "node:assert/strict"
import Program from "@server/core/link-manager/auth-manager/program-manager/program"
import { categories, categoryOf } from "@client/view/structure/desktop/layers/shell/start-menu/programs/categories"
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

  // Each category holds its Programs once, in the order the categories first appear; none is "Other".
  const tool = new Program({ identity: "tool", categories: ["Development", "Productivity"], client: { location: "." } }).record()
  assert.equal(categoryOf(empty), "Other")
  assert.deepEqual(categories([program, tool, empty, program]), [
      { category: "Productivity", count: 2 },
      { category: "Development", count: 1 },
      { category: "Other", count: 1 }
  ])
}, 120_000)
