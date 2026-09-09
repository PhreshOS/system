import { Surface } from "@phreshos/react-ui"

export default function SearchBar({ query, onChange, username }: Readonly<{ query: string, onChange: (query: string) => void, username: string | null }>) {

    return <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center" style={{ gap: "inherit" }}>

        <Surface className="min-w-0 focus-within:outline focus-within:outline-1 focus-within:outline-current">

            <input

                type="search"

                aria-label="Search Programs and Processes"

                placeholder="Search Programs and Processes…"

                value={query}

                onChange={event => onChange(event.currentTarget.value)}

                className="h-9 w-full min-w-0 border-0 bg-transparent px-3 text-sm outline-none placeholder:text-current placeholder:opacity-50"

            />

        </Surface>

        {username !== null && <Surface className="flex h-9 min-w-0 items-center gap-2 px-2 text-xs" title={username} aria-label={`Signed in as ${username}`}>

            <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-full border border-current/15 font-medium">{[...username][0]?.toUpperCase()}</span>

            <span className="truncate">{username}</span>

        </Surface>}

    </div>
}
