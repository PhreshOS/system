import {
    describeStorageScope,
    type StoragePermissionOperation,
    type StorageScope
} from "@phreshos/core"
import { existsSync, realpathSync } from "node:fs"
import { homedir } from "node:os"
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path"

type NativeStorageRegion = Readonly<{
    operations: readonly StoragePermissionOperation[]
    path: string
    recursive: boolean
}>

/** Whether one native Storage grant fully contains another requested scope. */
export function nativeStorageScopeCovers(grant: StorageScope, requested: StorageScope) {

    const outer = nativeRegion(grant)
    const inner = nativeRegion(requested)

    return inner.operations.every(operation => outer.operations.includes(operation))
        && regionCovers(outer, inner.path, inner.recursive)
}

/** Whether one scope provides any access, or one operation, at an exact path. */
export function nativeStorageScopeAccesses(
    grant: StorageScope,
    path: string,
    operation?: StoragePermissionOperation
) {

    const region = nativeRegion(grant)

    return (!operation || region.operations.includes(operation))
        && regionCovers(region, nativePath(path), false)
}

function nativeRegion(scope: StorageScope): NativeStorageRegion {

    const description = describeStorageScope(scope)

    return Object.freeze({
        operations: description.operations,
        path: nativePath(description.path),
        recursive: description.recursive
    })
}

function nativePath(path: string) {

    const absolute = resolve(homedir(), path)
    const remaining: string[] = []
    let current = absolute

    while (!existsSync(current)) {

        const parent = dirname(current)

        if (parent === current) break

        remaining.unshift(basename(current))
        current = parent
    }

    const canonical = existsSync(current)
        ? resolve(realpathSync.native(current), ...remaining)
        : absolute

    return process.platform === "win32" ? canonical.toLowerCase() : canonical
}

function regionCovers(grant: NativeStorageRegion, requestedPath: string, requestedRecursive: boolean) {

    if (!grant.recursive) return !requestedRecursive && grant.path === requestedPath

    const step = relative(grant.path, requestedPath)

    return step === "" || step !== ".." && !step.startsWith(`..${sep}`) && !isAbsolute(step)
}
