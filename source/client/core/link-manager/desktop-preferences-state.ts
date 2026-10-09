import { type DesktopPreferences, type ResolvedDesktopPreferences } from "@phreshos/core"
import { Tunnel } from "@the-link/core"

/** What one browser Desktop's owner chose, and what it resolves to; each announces its own change. */
export default class DesktopPreferencesState {

    public readonly tunnel = new Tunnel()

    public constructor(private chosen: DesktopPreferences, private current: ResolvedDesktopPreferences) {}

    public get preferences() {

        return this.chosen
    }

    public get resolved() {

        return this.current
    }

    public async update(preferences: DesktopPreferences, resolved: ResolvedDesktopPreferences) {

        const changed = !samePreferences(this.chosen, preferences)
        const changedResolved = !samePreferences(this.current, resolved)

        this.chosen = preferences
        this.current = resolved

        // These events are intentionally local: Desktop preferences do not belong
        // to the System transport or to any other Desktop representation.
        if (changed) await this.tunnel.publish("change", preferences)
        if (changedResolved) await this.tunnel.publish("changeResolved", resolved)
    }
}

function samePreferences<Preferences extends DesktopPreferences | ResolvedDesktopPreferences>(first: Preferences, second: Preferences) {

    return first.theme === second.theme
        && first.animations === second.animations
        && first.scale === second.scale
}
