import { Button } from "@heroui/react"

export default function ({ title, error, retry }: FailureProps) {

    return <div className="grid place-self-center justify-items-center gap-4 p-6 text-center">

        <h1 className="text-xl font-semibold">{title}</h1>

        <p className="text-muted">{error instanceof Error ? error.message : String(error)}</p>

        <Button onPress={() => void retry()}>Try again</Button>

    </div>
}

interface FailureProps {

    title: string

    error: unknown

    retry: () => Promise<unknown>
}
