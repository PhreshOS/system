import { Switch, SwitchGroup } from "@heroui/react"
import useStorage from "@libs/storage-hook"
import { useTheme } from "next-themes"

export default function () {

    const { resolvedTheme, setTheme } = useTheme()

    const direction = useStorage("direction")

    const reversed = direction.value === "rtl"

    return <main dir={reversed ? "rtl" : "ltr"} className="grid min-h-dvh place-content-center justify-items-start gap-6 bg-background font-roboto text-foreground">

        <p className="text-xl font-medium">PhreshOS</p>

        <SwitchGroup>

            <Switch isSelected={resolvedTheme === "dark"} onChange={dark => setTheme(dark ? "dark" : "light")}>

                <Switch.Content>

                    <Switch.Control>

                        <Switch.Thumb />

                    </Switch.Control>

                    Dark theme

                </Switch.Content>

            </Switch>

            <Switch isSelected={reversed} onChange={reversed => direction.update(reversed ? "rtl" : "ltr")}>

                <Switch.Content>

                    <Switch.Control>

                        <Switch.Thumb />

                    </Switch.Control>

                    Reverse reading direction

                </Switch.Content>

            </Switch>

        </SwitchGroup>

    </main>
}
