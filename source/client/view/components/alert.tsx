import { ComponentProps } from "react"

export default function ({ className, ...props }: ComponentProps<"div">) {

    return <div role="alert" className={`rounded border px-3 py-2 ${className ?? ""}`} {...props} />
}
