import { type ComponentProps, Fragment, useLayoutEffect } from "react"
import { ThemeProvider } from "next-themes"
import useStorage from "@libs/storage-hook"
import "./appearance.css"

export default function ({ children }: ComponentProps<typeof Fragment>) {

    const direction = useStorage("direction")

    useLayoutEffect(function () {

        document.documentElement.dir = direction.value === "rtl" ? "rtl" : "ltr"

    }, [direction.value])

    return <ThemeProvider attribute="class" defaultTheme="system">

        <div className="grid min-h-dvh grid-rows-[auto_minmax(0,1fr)] bg-background font-roboto text-foreground">

            {children}

        </div>

    </ThemeProvider>
}
