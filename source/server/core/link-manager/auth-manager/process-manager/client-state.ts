import ClientMemoryState from "./client-memory"

/**
 * The current execution context of a Process's Client Endpoint.
 *
 * Browser tabs may each represent this state with an iframe and a nearby
 * boundary. The Client Endpoint-owned Window survives when this context stops.
 */
export default class ClientState {

    public readonly memory = new ClientMemoryState()

    /** The Service name this Client run is reached by, or `false` for none. */
    public readonly service: string | false

    public constructor(service: string | false) {

        this.service = service
    }
}
