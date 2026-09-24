import assert from "node:assert/strict"
import { renderToStaticMarkup } from "react-dom/server"
import Readiness, { ReadinessState } from "@libs/readiness"
import Loading from "@client/view/components/loading"
import { test } from "vitest"

test("readiness contract", async () => {
  const connection = { message: "Connecting" }
  const sessionRequirement = { message: "Preparing session" }
  const wallpaper = { message: "Loading wallpaper" }
  const programs = { message: "Loading programs" }
  const startup = ReadinessState.start([connection, sessionRequirement, wallpaper])

  assert.deepEqual(startup.pending, [connection, sessionRequirement, wallpaper])

  const connected = startup.ready(connection)
  const extended = connected.require(programs)
  const session = extended.ready(sessionRequirement)
  const wallpaperReady = session.ready(wallpaper)
  const complete = wallpaperReady.ready(programs)

  assert.deepEqual(connected.pending, [sessionRequirement, wallpaper])
  assert.deepEqual(extended.pending, [sessionRequirement, wallpaper, programs])
  assert.deepEqual(complete.pending, [])
  assert.equal(complete.ready(programs), complete)

  const recomposed = complete.require(wallpaper).require(connection).require(sessionRequirement)

  assert.deepEqual(recomposed.pending, [connection, sessionRequirement, wallpaper])
  assert.deepEqual(recomposed.ready(connection).ready(sessionRequirement).ready(wallpaper).pending, [])
  assert.equal(recomposed.require(connection), recomposed)

  const lateRequirement = { message: "Late work" }
  const late = complete.require(lateRequirement)

  assert.deepEqual(late.requirements, [connection, sessionRequirement, wallpaper, programs, lateRequirement])
  assert.deepEqual(late.pending, [lateRequirement])

  assert.throws(() => startup.ready({ message: "Connecting" }), /does not know/)
  assert.throws(() => ReadinessState.start([connection, connection]), /already knows/)

  const sameDataWithDistinctIdentities = ReadinessState.start([{ message: "Same" }, { message: "Same" }])
  assert.equal(sameDataWithDistinctIdentities.pending.length, 2)

  const pendingMarkup = renderToStaticMarkup(
      <Readiness requirements={["connection"]}>
          <Readiness.Pending><span>Loading</span></Readiness.Pending>
          <p>Prepared content</p>
      </Readiness>
  )

  const readyMarkup = renderToStaticMarkup(
      <Readiness requirements={[]}>
          <Readiness.Pending><span>Loading</span></Readiness.Pending>
          <p>Prepared content</p>
      </Readiness>
  )

  assert.match(pendingMarkup, /Loading/)
  assert.match(pendingMarkup, /Prepared content/)
  assert.doesNotMatch(readyMarkup, /Loading/)
  assert.match(readyMarkup, /Prepared content/)

  const observedPendingMarkup = renderToStaticMarkup(
      <Readiness requirements={["connection", "session"]}>
          <Readiness.Pending>{pending => <span>{pending.join(",")}</span>}</Readiness.Pending>
      </Readiness>
  )

  const observedReadyMarkup = renderToStaticMarkup(
      <Readiness requirements={[]}>
          <Readiness.Pending>{pending => <span>{pending.length}</span>}</Readiness.Pending>
      </Readiness>
  )

  const describedRequirementMarkup = renderToStaticMarkup(
      <Readiness requirements={[connection]}>
          <Readiness.Pending<{ message: string }>>
              {pending => <span>{pending[0]?.message}</span>}
          </Readiness.Pending>
      </Readiness>
  )

  assert.match(observedPendingMarkup, /connection,session/)
  assert.match(observedReadyMarkup, />0</)
  assert.match(describedRequirementMarkup, /Connecting/)

  const fallbackMessageMarkup = renderToStaticMarkup(<Loading>Loading…</Loading>)
  assert.match(fallbackMessageMarkup, /data-loading-message="true"/)
  assert.match(fallbackMessageMarkup, /Loading…/)
}, 120_000)
