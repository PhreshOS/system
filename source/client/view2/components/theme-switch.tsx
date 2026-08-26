import { Switch } from "@heroui/react"
import { useTheme } from "next-themes"

export default function () {

    const { resolvedTheme, setTheme } = useTheme()

    return <Switch isSelected={resolvedTheme === "dark"} onChange={dark => setTheme(dark ? "dark" : "light")}>

        <Switch.Content>

            <Switch.Control><Switch.Thumb /></Switch.Control>

            Dark theme

        </Switch.Content>

    </Switch>
}
