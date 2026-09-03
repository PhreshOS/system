import assert from "node:assert/strict"
import Program from "@server/core/link-manager/auth-manager/program-manager/program"
import { developmentTarget } from "@server/view/http/program/development"

const development = new Program({

    identity: "example",

    client: { location: "http://localhost:5173/start" }
})

const target = developmentTarget(

    development,

    `http://localhost:4300/program/${development.assetId}/assets/main.ts?direct`
)

assert.equal(target?.href, `http://localhost:5173/program/${development.assetId}/assets/main.ts?direct`)

const production = new Program({

    identity: "example",

    client: { location: "dist/client" }
})

assert.equal(developmentTarget(production, `http://localhost:4300/program/${production.assetId}/assets/`), null)
