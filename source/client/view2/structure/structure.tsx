import { Switch, SwitchGroup } from "@heroui/react"
import { useLayoutEffect, useState } from "react"
import { useTheme } from "next-themes"

export default function ({ document }: StructureProps) {

    const { resolvedTheme, setTheme } = useTheme()

    const [reversed, setReversed] = useState(false)

    useLayoutEffect(function () {

        document.documentElement.dir = reversed ? "rtl" : "ltr"

    }, [document, reversed])

    return <section className="grid justify-items-start gap-6">

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

            <Switch isSelected={reversed} onChange={setReversed}>

                <Switch.Content>

                    <Switch.Control>

                        <Switch.Thumb />

                    </Switch.Control>

                    Reverse reading direction

                </Switch.Content>

            </Switch>

        </SwitchGroup>

    </section>
}

interface StructureProps {

    document: Document
}
