import React, { useState, useEffect } from "react"

/**
 * The useScreen hook provides responsive design capabilities by tracking
 * if the current window width falls within specified minimum and maximum bounds.
 * 
 * This hook enables components to adapt their behavior based on screen size,
 * making it easier to implement responsive designs without relying on CSS media queries.
 * 
 * @param min Optional minimum width in pixels for the range to be active
 * @param max Optional maximum width in pixels for the range to be active
 * @returns A boolean indicating whether the current screen width is within the specified range
 * 
 * @example
 * 
 * const isTablet = useScreen(768, 1024)
 * 
 * if (isTablet) {
 *   // Render tablet-specific content
 * }
 */
export const useScreen = function (min?: number, max?: number): boolean {

    /**
     * State tracking whether the current screen width is within the specified range.
     * Initial value is determined by comparing the window width against min/max values.
     */
    const [inRange, setInRange] = useState((!min && !max) ? false : (min ? window.innerWidth >= min : true) && (max ? window.innerWidth <= max : true))

    /**
     * Sets up an event listener to track window resize events and update
     * the inRange state when the screen dimensions change.
     * 
     * The effect cleans up by removing the event listener when the component unmounts
     * or when min/max dependencies change.
     */
    useEffect(() => {

        /**
         * Handler function that recalculates whether the screen width
         * is within the specified range and updates the state accordingly.
         */
        const resize = () => setInRange((!min && !max) ? false : (min ? window.innerWidth >= min : true) && (max ? window.innerWidth <= max : true))

        // Add resize listener
        window.addEventListener("resize", resize)

        /**
         * On end remove resize listener
         */
        return () => window.removeEventListener("resize", resize)

    }, [min, max])

    return inRange
}

/**
 * Screen is a responsive component that conditionally renders content
 * based on whether the current screen width falls within specified bounds.
 * 
 * It leverages the useScreen hook internally to determine which content to display,
 * providing a declarative way to implement responsive UIs.
 * 
 * @param min Optional minimum width in pixels for the content to be shown
 * @param max Optional maximum width in pixels for the content to be shown
 * @param available Content to display when the screen width is within range
 * @param unavailable Content to display when the screen width is out of range
 * @returns Either the 'available' or 'unavailable' content based on current screen size
 * 
 * @example
 * 
 * <Screen
 *   min={768}
 *   available={<DesktopNavigation />}
 *   unavailable={<MobileNavigation />}
 * />
 */
const Screen = ({ min, max, available, unavailable }: ScreenProps) => {

    /**
     * Determines if the current screen width is within the specified range.
     * The result controls which content variant is rendered.
     */
    const screen = useScreen(min, max)

    return <React.Fragment>{screen ? available : unavailable}</React.Fragment>
}

/**
 * The useOrientation hook tracks the current device orientation.
 * 
 * It detects whether the device is in landscape, portrait, or square orientation
 * based on comparing window width and height dimensions.
 * 
 * @returns The current orientation as "landscape", "portrait", or "square"
 * 
 * @example
 * 
 * const orientation = useOrientation()
 * 
 * if (orientation === "landscape") {
 *   // Apply landscape-specific logic
 * }
 */
export const useOrientation = (): OrientationType => {

    /**
     * Determines the initial orientation based on comparing
     * window width and height dimensions.
     */
    const initialOrientation: OrientationType = window.innerWidth > window.innerHeight ? "landscape" :
        window.innerWidth < window.innerHeight ? "portrait" : "square"

    /**
     * State tracking the current device orientation.
     */
    const [orientation, setOrientation] = useState<OrientationType>(initialOrientation)

    /**
     * Sets up an event listener to track window resize events and
     * recalculate the orientation when dimensions change.
     * 
     * The effect cleans up by removing the event listener when the component unmounts.
     */
    useEffect(() => {

        /**
         * Handler function that recalculates the current orientation
         * based on window dimensions and updates the state accordingly.
         */
        const resize = function () {

            // Landscape orientation
            if (window.innerWidth > window.innerHeight) setOrientation("landscape")

            // Portrait orientation
            else if (window.innerWidth < window.innerHeight) setOrientation("portrait")

            // Square orientation
            else setOrientation("square")

        }

        // Add resize listener
        window.addEventListener("resize", resize)

        /**
         * On end remove resize listener
         */
        return () => window.removeEventListener("resize", resize)

    }, [])

    return orientation
}

/**
 * Orientation is a component that conditionally renders content
 * based on the current device orientation.
 * 
 * It leverages the useOrientation hook internally to determine which
 * content to display, providing a declarative way to adapt UI based on
 * device orientation changes.
 * 
 * @param cases An object containing content to display for different orientations
 * @returns The content associated with the current orientation
 * 
 * @example
 * 
 * <Orientation
 *   landscape={<LandscapeLayout />}
 *   portrait={<PortraitLayout />}
 *   square={<SquareLayout />}
 * />
 */
export const Orientation = (cases: Partial<Record<OrientationType, React.ReactNode>>) => {

    /**
     * Tracks the current device orientation to determine
     * which content variant should be rendered.
     */
    const orientation = useOrientation()

    return <React.Fragment>{cases[orientation]}</React.Fragment>
}

/**
 * Common breakpoint for small screen devices.
 * This constant can be used with the useScreen hook or Screen component
 * to implement consistent responsive behavior across the application.
 */
export const SMALL_SCREEN: number = 768

/**
 * Detection for mobile devices based on user agent.
 * This boolean can be used to apply mobile-specific logic or optimizations.
 */
export const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)

/**
 * Defines the possible device orientation types.
 * Used by the useOrientation hook and Orientation component.
 */
export type OrientationType = "landscape" | "portrait" | "square"

/**
 * Props interface for the Screen component.
 * Defines the configuration options and content variants
 * for responsive rendering.
 */
interface ScreenProps {
    min?: number
    max?: number
    available?: React.ReactNode
    unavailable?: React.ReactNode
}

export default Screen