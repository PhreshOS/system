/**
 * The current execution context of a Process's Client Endpoint.
 *
 * Browser tabs may each represent this state with an iframe and a nearby
 * boundary. The Client Endpoint-owned Window survives when this context stops.
 */
export default class ClientState {

    public readonly service: boolean

    public constructor(service: boolean) {

        this.service = service
    }
}
