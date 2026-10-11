import type Program from "@client/core/link-manager/auth-manager/program-manager/program"
import usePromise from "@libs/react-promise"
import Alert from "@client/view/components/alert"
import { AlertDialog, Button, Checkbox } from "@phreshos/react-ui"
import { createContext, useCallback, useContext, useState, type ReactNode } from "react"
import { useDesktopScaleContainer } from "../../../desktop-scale"
import { useCloseStartMenu } from "../start-menu/start-menu"
import useShown from "./shown"

const UninstallProgramContext = createContext<((program: Program) => void) | null>(null)

/**
 * Lets the Shell's Program menus ask to uninstall a Program: the owner confirms in a dialog over the
 * whole Desktop, which the Start Menu would stand above, so it closes first.
 */
export function UninstallProgramProvider({ children }: Readonly<{ children: ReactNode }>) {

    const [program, setProgram] = useState<Program | null>(null)

    const closeStartMenu = useCloseStartMenu()

    const ask = useCallback(function (program: Program) {

        closeStartMenu()

        setProgram(program)

    }, [closeStartMenu])

    return <UninstallProgramContext.Provider value={ask}>

        {children}

        <UninstallProgram program={program} onDone={() => setProgram(null)} />

    </UninstallProgramContext.Provider>
}

/** Asks the owner to confirm uninstalling a Program. */
export function useUninstallProgram() {

    const ask = useContext(UninstallProgramContext)

    if (!ask) throw new Error("Uninstalling a Program from the Shell requires UninstallProgramProvider")

    return ask
}

function UninstallProgram({ program, onDone }: Readonly<{ program: Program | null, onDone: () => void }>) {

    const container = useDesktopScaleContainer()

    // The Program stays shown while the dialog leaves, so it does not empty as it fades.
    const shown = useShown(program ?? undefined)

    return <AlertDialog open={program !== null}>

        <AlertDialog.Backdrop portalContainer={container ?? undefined}>

            <AlertDialog.Content style={{ width: "28rem" }}>

                {/* Keyed by the Program: a new one starts with nothing chosen. */}
                {shown && <UninstallProgramView key={shown.reference} program={shown} onDone={onDone} />}

            </AlertDialog.Content>

        </AlertDialog.Backdrop>

    </AlertDialog>
}

function UninstallProgramView({ program, onDone }: Readonly<{ program: Program, onDone: () => void }>) {

    const [purge, setPurge] = useState(false)

    const uninstalling = usePromise(async () => {

        for await (const _chunk of program.uninstall({ purge })) { /* consume command output */ }

        onDone()
    })

    return <>

        <AlertDialog.Header>

            <AlertDialog.Title>Uninstall {program.name}?</AlertDialog.Title>

            <AlertDialog.Description>Its Processes end and its files are removed.</AlertDialog.Description>

        </AlertDialog.Header>

        <AlertDialog.Body>

            <Checkbox checked={purge} disabled={uninstalling.isPending} onChange={setPurge} label="Also remove its data" description="Its storage, store, and database. Otherwise they stay for a later install." />

            {uninstalling.exception && <Alert className="text-sm">{String(uninstalling.exception.current)}</Alert>}

        </AlertDialog.Body>

        <AlertDialog.Footer>

            <Button autoFocus disabled={uninstalling.isPending} onPress={onDone}>Cancel</Button>

            <Button color="danger" pending={uninstalling.isPending} onPress={() => void uninstalling.safeExecute()}>Uninstall</Button>

        </AlertDialog.Footer>

    </>
}
