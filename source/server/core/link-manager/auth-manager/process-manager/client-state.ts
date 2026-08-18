import Window from "./window"

/**
 * The one authoritative client state of a Process.
 *
 * Browser tabs may each represent this state with an iframe and a nearby
 * boundary, but none of those representations owns it. The Window is part of
 * this state and therefore begins and ends with the client, not with a tab.
 */
export default class ClientState {

    public readonly window: Window

    public constructor(window: Window) {

        this.window = window
    }
}
