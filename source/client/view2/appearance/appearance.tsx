import { type PropsWithChildren } from "react"
import { ThemeProvider } from "next-themes"
import "./appearance.css"

export default function ({ children }: PropsWithChildren) {

    return <ThemeProvider attribute="class" defaultTheme="system">

        <main className="grid min-h-dvh place-items-center bg-background font-roboto text-foreground">

            {children}

        </main>

    </ThemeProvider>
}
