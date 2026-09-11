export const storageMediaType = "application/x-storage-stream"

type StorageOperation = Readonly<{
    path: string[]
}> & (
    | Readonly<{ operation: "stream", offset?: number, length?: number }>
    | Readonly<{ operation: "write", overwrite?: boolean }>
    | Readonly<{ operation: "append" }>
)

export type ProgramAddress = Readonly<{
    identity: string
    reference: string
}>

export type StorageRequest = StorageOperation & (
    | Readonly<{ scope: "system" }>
    | Readonly<{ scope: "program", program: ProgramAddress, area: "data" | "cache" }>
)
