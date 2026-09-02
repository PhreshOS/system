export const storageMediaType = "application/x-storage-stream"

type StorageOperation = Readonly<{
    operation: "stream" | "write"
    path: string[]
}>

export type ProgramAddress = Readonly<{
    identity: string
    reference: string
}>

export type StorageRequest = StorageOperation & (
    | Readonly<{ scope: "system" }>
    | Readonly<{ scope: "program", program: ProgramAddress, area: "data" | "cache" }>
)
