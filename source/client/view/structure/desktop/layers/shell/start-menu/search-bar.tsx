import { Input } from "@phreshos/react-ui"
import { wellMaterial } from "./start-menu-panel"

export default function SearchBar({ query, onChange }: Readonly<{ query: string, onChange: (query: string) => void }>) {

    return <Input
        aria-label="Search Programs and Processes"
        placeholder="Search Programs and Processes…"
        material={wellMaterial}
        value={query}
        onChange={onChange}
    />
}
