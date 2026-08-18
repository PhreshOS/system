import { Finalizer, Forwarder, Interceptor, Subscriber } from "../tunnel"
import TheLink, { Publisher, TunnelName } from "../the-link"

/**
 * Register a method as an interceptor on one of the link tunnels.
 *
 * The decorated method is bound to each instance during TheLink initialization
 * and registered with prefix matching on the selected tunnel.
 *
 * @param tunnelName Target tunnel for interceptor registration
 * @param prefix Event prefix to intercept, or an empty string for all events
 * @returns Legacy method decorator
 */
export function Intercept(tunnelName: TunnelName, prefix: string = "") {

    return function <TargetLink extends TheLink>(targetLink: TargetLink, interceptorName: string, _descriptor: TypedPropertyDescriptor<Interceptor>) {

        targetLink.addInitializer(function (instanceLink) {

            // Select the tunnel when the concrete instance is available.
            const tunnel = tunnelName === "outbound" ? instanceLink.$outbound : instanceLink.$inbound

            const interceptor = instanceLink[interceptorName as keyof TargetLink] as Interceptor

            // Bind the method so decorators preserve instance context.
            tunnel.addInterceptor(interceptor.bind(instanceLink), prefix)
        })
    }
}

/**
 * Register a method as a subscriber for a tunnel event.
 *
 * The decorated method is bound during instance initialization and subscribed to
 * the configured event on the selected tunnel.
 *
 * @param event Event identifier to subscribe to
 * @param tunnelName Target tunnel for subscription
 * @returns Legacy method decorator
 */
export function Subscribe(event: string, tunnelName: TunnelName = "inbound") {

    return function <TargetLink extends TheLink>(targetLink: TargetLink, subscriberName: string, _descriptor: TypedPropertyDescriptor<Subscriber>) {

        targetLink.addInitializer(function (instanceLink) {

            // Select the tunnel when the concrete instance is available.
            const tunnel = tunnelName === "outbound" ? instanceLink.$outbound : instanceLink.$inbound

            const subscriber = instanceLink[subscriberName as keyof TargetLink] as Subscriber

            // Bind the method so subscribers run with the instance as `this`.
            tunnel.subscribe(event, subscriber.bind(instanceLink))
        })
    }
}

/**
 * Register a method as a forwarder on one of the link tunnels.
 *
 * Forwarders receive matching events from the selected tunnel and can route them
 * to another destination with optional prefix translation.
 *
 * @param tunnelName Target tunnel for forwarder registration
 * @param fromPrefix Source event prefix to match
 * @param toPrefix Destination event prefix to apply
 * @returns Legacy method decorator
 */
export function Forward(tunnelName: TunnelName, fromPrefix: string = "", toPrefix: string = "") {

    return function <TargetLink extends TheLink>(targetLink: TargetLink, forwarderName: string, _descriptor: TypedPropertyDescriptor<Forwarder>) {

        targetLink.addInitializer(function (instanceLink) {

            // Select the tunnel when the concrete instance is available.
            const tunnel = tunnelName === "outbound" ? instanceLink.$outbound : instanceLink.$inbound

            const forwarder = instanceLink[forwarderName as keyof TargetLink] as Forwarder

            // Bind the method before registering it as a tunnel forwarder.
            tunnel.forwardTo(forwarder.bind(instanceLink), fromPrefix, toPrefix)
        })
    }
}

/**
 * Register a method as a finalizer on one of the link tunnels.
 *
 * Finalizers run after subscribers and forwarders, allowing result arrays to be
 * transformed before publish returns.
 *
 * @param tunnelName Target tunnel for finalizer registration
 * @param prefix Event prefix to finalize, or an empty string for all events
 * @returns Legacy method decorator
 */
export function Finalize(tunnelName: TunnelName, prefix: string = "") {

    return function <TargetLink extends TheLink>(targetLink: TargetLink, finalizerName: string, _descriptor: TypedPropertyDescriptor<Finalizer>) {

        targetLink.addInitializer(function (instanceLink) {

            // Select the tunnel when the concrete instance is available.
            const tunnel = tunnelName === "outbound" ? instanceLink.$outbound : instanceLink.$inbound

            const finalizer = instanceLink[finalizerName as keyof TargetLink] as Finalizer

            // Bind the method so finalizers preserve instance context.
            tunnel.addFinalizer(finalizer.bind(instanceLink), prefix)
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
 * @returns Legacy method decorator
 */
export function Publish(event: string, tunnelName: TunnelName = "outbound") {

    return function <TargetLink extends TheLink>(targetLink: TargetLink, publisherName: string, _descriptor: TypedPropertyDescriptor<Publisher>) {

        targetLink.addInitializer(function (instanceLink) {

            // Select the tunnel when the concrete instance is available.
            const tunnel = tunnelName === "outbound" ? instanceLink.$outbound : instanceLink.$inbound

            const publisher = instanceLink[publisherName as keyof TargetLink] as Publisher

            // Replace the method with a wrapper that publishes its resolved result.
            (instanceLink[publisherName as keyof TargetLink] as Publisher) = async function (...values: unknown[]) {

                const result = await publisher.apply(instanceLink, values)

                await tunnel.publish(event, result)

                return result
            }
        })
    }
}

/**
 * Combine inbound subscription with outbound publication for one method.
 *
 * Equivalent to applying `Publish(publishEvent || subscribeEvent, "outbound")`
 * and `Subscribe(subscribeEvent, "inbound")` to the same method.
 *
 * @param subscribeEvent Inbound event identifier to subscribe to
 * @param publishEvent Optional outbound event identifier, defaults to subscribeEvent
 * @returns Legacy method decorator
 */
export function Connect(subscribeEvent: string, publishEvent?: string) {

    return function <TargetLink extends TheLink>(targetLink: TargetLink, methodName: string, descriptor: TypedPropertyDescriptor<Subscriber & Publisher>) {

        // Register publish first so Subscribe captures the wrapped method.
        Publish(publishEvent || subscribeEvent, "outbound")(targetLink, methodName, descriptor)

        Subscribe(subscribeEvent, "inbound")(targetLink, methodName, descriptor)
    }
}