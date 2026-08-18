import { v4 as uuidv4 } from "uuid"
import TheLink from "./the-link"
import Tunnel from "./tunnel"

/**
 * Reactive property synchronized through a TheLink instance.
 *
 * A provider owns the property key and source value. Consumers bind to that key
 * and receive `property-update:<key>` events through their link. Every Property
 * also exposes a local tunnel that publishes `change` whenever its stored value
 * changes.
 */
export default class Property<Value> {

    /**
     * Local notification tunnel for this property's value changes.
     */
    public readonly tunnel: Tunnel = new Tunnel()

    /**
     * Provider or consumer role controlling update propagation.
     */
    private readonly type: PropertyType

    /**
     * Link used to publish and receive cross-instance property updates.
     */
    private readonly theLink: TheLink

    /**
     * Unique property identifier used in the update event namespace.
     */
    public readonly key: string

    /**
     * Current locally stored value.
     */
    private _value: Value

    /**
     * Optional inbound value mapper or validator.
     */
    private interceptor: PropertyInterceptor<any, Value> | null = null

    /**
     * Initialize a property instance and subscribe it to its update namespace.
     *
     * @param type Provider or consumer role
     * @param theLink Link used for cross-instance synchronization
     * @param key Property update namespace key
     * @param value Initial local value
     */
    private constructor(type: PropertyType, theLink: TheLink, key: string, value: Value) {

        this.type = type

        this.theLink = theLink

        this.key = key

        this._value = value

        // Receive updates published by connected providers or consumers.
        this.theLink.$inbound.subscribe(`property-update:${this.key}`, this.updateHandler.bind(this))
    }

    /**
     * Create a public provider property with a generated key.
     *
     * Public providers accept inbound update requests and relay accepted values
     * back outbound to synchronize all consumers.
     *
     * @param theLink Link used for synchronization
     * @param value Initial provider value
     * @param interceptor Optional inbound value mapper or validator
     * @returns Provider property with a generated key
     */
    public static public<Value>(theLink: TheLink, value: Value, interceptor?: PropertyInterceptor<any, Value>) {

        const property = new this("provider", theLink, uuidv4(), value)

        if (interceptor) property.setInterceptor(interceptor)

        return property
    }

    /**
     * Create a private provider property with a generated key.
     *
     * Private providers reject inbound update requests by installing an
     * interceptor that always throws.
     *
     * @param theLink Link used for synchronization
     * @param value Initial provider value
     * @returns Provider property that rejects consumer update requests
     */
    public static private<Value>(theLink: TheLink, value: Value) {

        return this.public(theLink, value, function () {

            throw new Error("You cannot request update a private property.")
        })
    }

    /**
     * Create a consumer property bound to an existing provider key.
     *
     * @param theLink Link used for synchronization
     * @param key Provider property key to consume
     * @param value Initial local value before the first provider update
     * @param interceptor Optional inbound value mapper or validator
     * @returns Consumer property bound to the provider key
     */
    public static consumer<Value>(theLink: TheLink, key: string, value: Value, interceptor?: PropertyInterceptor<any, Value>) {

        const property = new Property("consumer", theLink, key, value)

        if (interceptor) property.setInterceptor(interceptor)

        return property
    }

    /**
     * Set or clear the inbound value interceptor.
     *
     * @param interceptor Mapper or validator for inbound values, or null to clear
     */
    public setInterceptor(interceptor: PropertyInterceptor<any, Value> | null) {

        this.interceptor = interceptor
    }

    /**
     * Current local property value.
     */
    public get value() {

        return this._value
    }

    /**
     * Store a new local value and notify local subscribers.
     *
     * @param value New local value
     */
    private async setValue(value: Value) {

        this._value = value

        await this.tunnel.publish("change", value)
    }

    /**
     * Publish a property update through the link's outbound tunnel.
     *
     * @param value Value to publish to connected links
     */
    private async publish(value: Value) {

        await this.theLink.$outbound.publish(`property-update:${this.key}`, value)
    }

    /**
     * Update this property and propagate the value.
     *
     * Providers update their local value immediately before publishing. Consumers
     * publish the request and rely on the provider's relayed update to settle the
     * synchronized value.
     *
     * @param value New value or requested value
     */
    public async update(value: Value) {

        if (this.type === "provider") await this.setValue(value)

        await this.publish(value)
    }

    /**
     * Handle an inbound property update event.
     *
     * @param value Incoming value from the link inbound tunnel
     */
    private async updateHandler(value: Value) {

        // Interceptors can transform or reject inbound values.
        if (this.interceptor) value = this.interceptor(value)

        await this.setValue(value)

        // Providers relay accepted inbound updates to every connected consumer.
        if (this.type === "provider") await this.publish(value)
    }

    /**
     * Serialize the property as its public key/value shape.
     *
     * @returns Plain object representation used by JSON.stringify
     */
    public toJSON() {

        return {

            key: this.key,

            value: this.value
        }
    }
}

/**
 * Property role in the provider/consumer relationship.
 */
export type PropertyType = "provider" | "consumer"

/**
 * Function applied to inbound property values before local storage.
 */
export type PropertyInterceptor<IncomingValue, ProcessedValue> = (incomingValue: IncomingValue) => ProcessedValue
