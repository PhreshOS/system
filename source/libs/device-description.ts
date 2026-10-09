/**
 * A short description of the browser and system a User-Agent names, such as "Chrome on macOS", or
 * `null` when it names no browser this recognizes. Only the description is kept: the full text
 * says more about the machine than anyone reading a list of Sessions needs.
 */
export default function deviceDescription(userAgent: string | null): string | null {

    if (!userAgent) return null

    const browser = browsers.find(([, pattern]) => pattern.test(userAgent))?.[0]

    if (!browser) return null

    const system = systems.find(([, pattern]) => pattern.test(userAgent))?.[0]

    return system ? `${browser} on ${system}` : browser
}

// Order matters: browsers built on Chromium also name Chrome, and Chrome also names Safari.
const browsers: readonly (readonly [string, RegExp])[] = [
    ["Edge", /\bEdg(?:e|A|iOS)?\//],
    ["Opera", /\bOPR\/|\bOpera\b/],
    ["Firefox", /\bFirefox\/|\bFxiOS\//],
    ["Chrome", /\bChrome\/|\bCriOS\//],
    ["Safari", /\bSafari\//]
]

// iOS and Android name other systems too, so they come first.
const systems: readonly (readonly [string, RegExp])[] = [
    ["iOS", /\biPhone\b|\biPad\b|\biPod\b/],
    ["Android", /\bAndroid\b/],
    ["ChromeOS", /\bCrOS\b/],
    ["Windows", /\bWindows\b/],
    ["macOS", /\bMacintosh\b|\bMac OS X\b/],
    ["Linux", /\bLinux\b/]
]
