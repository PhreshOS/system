import { expect, test } from "vitest"
import { failed } from "@libs/request-outcome"

test("a refusal the System wrote reaches the one who asked, even when nothing else may", () => {
    expect(failed(new Error("This program declared no client half"), false))
        .toEqual({ success: false, error: "This program declared no client half" })
})

test("what fails beneath the System stays hidden unless disclosure is allowed", () => {
    const system = Object.assign(new Error("ENOENT: no such file or directory, open '/home/owner/.secret'"), { code: "ENOENT" })
    for (const exception of [new TypeError("Cannot read properties of undefined"), system, "a thrown string"]) {
        expect(failed(exception, false)).toEqual({ success: false, error: "An unknown exception occurred" })
    }
    expect(failed(new TypeError("Cannot read properties of undefined"), true)).toEqual({ success: false, error: "Cannot read properties of undefined" })
})
