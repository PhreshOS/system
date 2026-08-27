import { useId } from "react"
import StartMenu from "./start-menu"

export default function () {

    const id = useId()

    return <>

        <button type="button" popoverTarget={id} aria-label="Start Menu" className="h-full min-w-[2.2rem] bg-danger" />

        <StartMenu id={id} />

    </>
}
