/**
 * The paths exposed by the server view. These are the actual route names used
 * by Hono in production and forwarded by Vite in development.
 */
const doors = {

    link: "/link",

    proxy: "/proxy",

    storage: "/storage",

    uploads: "/uploads",

    program: "/program"
}

export type Doors = typeof doors

export default doors
