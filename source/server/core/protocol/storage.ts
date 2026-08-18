export const storageMediaType = "application/x-storage-stream"

export interface StorageRequest {

    program: string

    area: "data" | "cache"

    operation: "stream" | "write"

    path: string[]
}
