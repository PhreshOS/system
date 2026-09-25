/** Orders the authoritative mutations produced by one visible Window gesture. */
export default class WindowGestureCommit {

    private outcome = Promise.resolve(true)

    public request(operation: () => Promise<boolean> | undefined) {

        this.outcome = this.outcome.then(async accepted => {

            if (!accepted) return false

            try {

                return await (operation() ?? true)
            }

            catch {

                return false
            }
        })
    }

    public settle() { return this.outcome }
}
