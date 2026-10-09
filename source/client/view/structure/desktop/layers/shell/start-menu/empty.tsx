import { AppLayout, Text } from "@phreshos/react-ui"

/** A quiet line where a list has nothing to show, in the middle of the content. */
export default function Empty({ children }: Readonly<{ children: string }>) {

    return <AppLayout.Placeholder><Text tone="secondary" size="small">{children}</Text></AppLayout.Placeholder>
}
