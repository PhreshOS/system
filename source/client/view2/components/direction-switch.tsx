import { Switch } from "@heroui/react"
import useStorage from "@libs/storage-hook"

export default function () {

    const direction = useStorage("direction")

    const reversed = direction.value === "rtl"

    return <Switch isSelected={reversed} onChange={value => direction.update(value ? "rtl" : "ltr")}>

        <Switch.Content>

            <Switch.Control><Switch.Thumb /></Switch.Control>

            Reverse reading direction

        </Switch.Content>

    </Switch>
}
