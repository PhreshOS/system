import { Input } from "@phreshos/react-ui"

export default function SearchBar({ query, onChange }: Readonly<{ query: string, onChange: (query: string) => void }>) {

    return <Input
        aria-label="Search Programs and Processes"
        placeholder="Search Programs and Processes…"
        value={query}
        onChange={onChange}
    />
}
