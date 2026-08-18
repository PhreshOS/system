import { Finalizer, Forwarder, Interceptor, Subscriber } from "../tunnel"
import TheLink, { Publisher, TunnelName } from "../the-link"

/**
 * Register a method as an interceptor on one of the link tunnels.
 *
 * Uses the standard ECMAScript decorator context to register the interceptor
 * when each instance is initialized.
 *
 * @param tunnelName Target tunnel for interceptor registration
 * @param prefix Event prefix to intercept, or an empty string for all events
 * @returns ECMAScript method decorator
 */
export function Intercept(tunnelName: TunnelName, prefix: string = "") {

    return function <TargetLink extends TheLink>(interceptor: Interceptor, context: ClassMethodDecoratorContext<TargetLink, Interceptor>) {

        if (context.static) throw new Error(`@${String(context.name)} cannot be used on static methods`)

        context.addInitializer(function () {

            // Select the tunnel from the concrete instance.
            const tunnel = tunnelName === "outbound" ? this.$outbound : this.$inbound

            // Bind the method so interceptors preserve instance context.
            tunnel.addInterceptor(interceptor.bind(this), prefix)
        })
    }
}

/**
 * Register a method as a subscriber for a tunnel event.
 *
 * @param event Event identifier to subscribe to
 * @param tunnelName Target tunnel for subscription
 * @returns ECMAScript method decorator
 */
export function Subscribe(event: string, tunnelName: TunnelName = "inbound") {

    return function <TargetLink extends TheLink>(subscriber: Subscriber, context: ClassMethodDecoratorContext<TargetLink, Subscriber>) {

        if (context.static) throw new Error(`@${String(context.name)} cannot be used on static methods`)

        context.addInitializer(function () {

            // Select the tunnel from the concrete instance.
            const tunnel = tunnelName === "outbound" ? this.$outbound : this.$inbound

            // Bind the method so subscribers run with the instance as `this`.
            tunnel.subscribe(event, subscriber.bind(this))
        })
    }
}

/**
 * Register a method as a forwarder on one of the link tunnels.
 *
 * @param tunnelName Target tunnel for forwarder registration
 * @param fromPrefix Source event prefix to match
 * @param toPrefix Destination event prefix to apply
 * @returns ECMAScript method decorator
 */
export function Forward(tunnelName: TunnelName, fromPrefix: string = "", toPrefix: string = "") {

    return function <TargetLink extends TheLink>(forwarder: Forwarder, context: ClassMethodDecoratorContext<TargetLink, Forwarder>) {

        if (context.static) throw new Error(`@${String(context.name)} cannot be used on static methods`)

        context.addInitializer(function () {

            // Select the tunnel from the concrete instance.
            const tunnel = tunnelName === "outbound" ? this.$outbound : this.$inbound

            // Bind the method before registering it as a tunnel forwarder.
            tunnel.forwardTo(forwarder.bind(this), fromPrefix, toPrefix)
        })
    }
}

/**
 * Register a method as a finalizer on one of the link tunnels.
 *
 * @param tunnelName Target tunnel for finalizer registration
 * @param prefix Event prefix to finalize, or an empty string for all events
 * @returns ECMAScript method decorator
 */
export function Finalize(tunnelName: TunnelName, prefix: string = "") {

    return function <TargetLink extends TheLink>(finalizer: Finalizer, context: ClassMethodDecoratorContext<TargetLink, Finalizer>) {

        if (context.static) throw new Error(`@${String(context.name)} cannot be used on static methods`)

        context.addInitializer(function () {

            // Select the tunnel from the concrete instance.
            const tunnel = tunnelName === "outbound" ? this.$outbound : this.$inbound

            // Bind the method so finalizers preserve instance context.
            tunnel.addFinalizer(finalizer.bind(this), prefix)
        })
    }
}

/**
 * Wrap a method so its return value is published as a tunnel event.
 *
 * The original method still returns its own result. After it resolves, that
 * result is published on the configured tunnel.
 *
 * @param event Event identifier to publish after method execution
 * @param tunnelName Target tunnel for publication
 * @returns ECMAScript method decorator
 */
export function Publish(event: string, tunnelName: TunnelName = "outbound") {

    return function <TargetLink extends TheLink>(publisher: Publisher, context: ClassMethodDecoratorContext<TargetLink, Publisher>) {

        if (context.static) throw new Error(`@${String(context.name)} cannot be used on static methods`)

        // Replace the decorated method with a publishing wrapper.
        return async function (this: TargetLink, ...values: unknown[]) {

            const tunnel = tunnelName === "outbound" ? this.$outbound : this.$inbound

            const result = await publisher.apply(this, values)

            await tunnel.publish(event, result)

            return result
        }
    }
}

/**
 * Combine inbound subscription with outbound publication for one method.
 *
 * Creates a publishing wrapper, registers that wrapper as the inbound subscriber,
 * and returns the wrapper as the decorated method implementation.
 *
 * @param subscribeEvent Inbound event identifier to subscribe to
 * @param publishEvent Optional outbound event identifier, defaults to subscribeEvent
 * @returns ECMAScript method decorator
 */
export function Connect(subscribeEvent: string, publishEvent?: string) {

    return function <TargetLink extends TheLink>(method: Subscriber & Publisher, context: ClassMethodDecoratorContext<TargetLink, Subscriber & Publisher>) {

        if (context.static) throw new Error(`@${String(context.name)} cannot be used on static methods`)

        // Create one publisher wrapper for both inbound and direct invocation.
        const publisher = Publish(publishEvent || subscribeEvent, "outbound")(method, context)

        // Register the publisher wrapper as the inbound subscriber.
        Subscribe(subscribeEvent, "inbound")(publisher, context)

        return publisher
    }
}