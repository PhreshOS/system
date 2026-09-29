import { type DesktopPreferences } from "@phreshos/core"
import { Tunnel } from "@the-link/core"

/** Complete effective preferences owned by one browser Desktop. */
export default class DesktopPreferencesState {

    public readonly tunnel = new Tunnel()

    public constructor(private current: DesktopPreferences) {}

    public get value() {

        return this.current
    }

    public async update(preferences: DesktopPreferences) {

        if (samePreferences(this.current, preferences)) return

        this.current = preferences

        // This event is intentionally local: Desktop preferences do not belong
        // to the System transport or to any other Desktop representation.
        await this.tunnel.publish("change", preferences)
    }
}

function samePreferences(first: DesktopPreferences, second: DesktopPreferences) {

    return first.theme === second.theme
        && first.animations === second.animations
        && first.scale === second.scale
}
