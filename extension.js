const vscode = require('vscode')
const PACKAGE_NAME = 'problems-fix-runner'

const nextEvent = new vscode.EventEmitter()
const stopEvent = new vscode.EventEmitter()
let config = {}
let outputChannel

/**
 * @param {vscode.ExtensionContext} context
 */
async function activate(context) {
    await readConfig()
    resetOutputChannel()

    // on config change
    vscode.workspace.onDidChangeConfiguration(async (e) => {
        if (e.affectsConfiguration(PACKAGE_NAME)) {
            await readConfig()

            if (!config.debug) {
                resetOutputChannel()
            }
        }
    })

    // on window change
    vscode.window.onDidChangeWindowState(async (e) => {
        if (!e.focused) {
            stopEvent.fire()
        }
    })

    // go to next
    context.subscriptions.push(
        vscode.commands.registerCommand('pfr.next', async () => {
            await runCmnd('hideSuggestWidget')
            nextEvent.fire()
        })
    )

    let running = false

    // loop over
    context.subscriptions.push(
        vscode.commands.registerCommand('pfr', async () => {
            await setWhen(true)

            // in case of double running the cmnd
            if (running) {
                return stopEvent.fire()
            }

            // clear old output
            if (outputChannel) {
                outputChannel.clear()
            }

            running = true
            let editor = vscode.window.activeTextEditor
            let { document: aDocument } = editor
            let diagnostics = vscode.languages.getDiagnostics(aDocument.uri)

            // debug
            if (config.debug) {
                for (const info of diagnostics) {
                    let { severity, source, message, code } = info

                    showDebugMsg(`source: ${source}`)
                    showDebugMsg(`code: ${code}`)
                    showDebugMsg(`message: ${message}`)
                    showDebugMsg(`severity: ${severity}`)
                    showDebugMsg('--------------------')
                }
            }

            diagnostics = sortSelections(
                diagnostics.filter((e) => {
                    return config.list.includes(e.source || e.code)
                })
            )

            // nothing found
            if (!diagnostics.length) {
                running = false
                await setWhen(false)

                return showMsg('Nothing Found')
            }

            // quick fix
            for (let i = 0; i < diagnostics.length; i++) {
                // stop loop
                stopEvent.event((e) => {
                    if (running) {
                        running = false
                        setWhen(false)
                        showMsg('Runner Stopped')
                    }
                })

                if (!running) {
                    break
                }

                const info = diagnostics[i]
                let { range: iRange } = info

                editor.selection = await new vscode.Selection(iRange.end, iRange.end)
                await runCmnd('hideSuggestWidget')
                await runCmnd('editor.action.quickFix')
                await new Promise((resolve) => {
                    // if no selection made, go next
                    let timer = setTimeout(() => {
                        stopEvent.fire() // FIXME: because we don't know how to hide the context menu :(
                        resolve()
                    }, config.waitFor * 1000)

                    // force go next
                    nextEvent.event((e) => {
                        clearTimeout(timer)
                        resolve()
                    })

                    // go next
                    vscode.workspace.onDidChangeTextDocument((e) => {
                        if (running && e) {
                            let { document, contentChanges } = e

                            if (
                                document == aDocument &&
                                contentChanges.length &&
                                contentChanges[0].range.isEqual(iRange)
                            ) {
                                clearTimeout(timer)
                                resolve()
                            }
                        }
                    })
                })
            }

            // reached the list end
            if (running) {
                running = false
                showMsg('All Done')
                setWhen(false)
            }
        })
    )
}

/* ---------------------------------- debug --------------------------------- */
function showDebugMsg(text) {
    if (outputChannel) {
        outputChannel.appendLine(text)
    }
}

function resetOutputChannel() {
    if (outputChannel) {
        outputChannel.dispose()
        outputChannel = undefined
    }

    if (config.debug) {
        outputChannel = vscode.window.createOutputChannel("Problems Fix Runner")
        outputChannel.show()
    }
}

/* --------------------------------- config --------------------------------- */
async function readConfig() {
    return config = await vscode.workspace.getConfiguration(PACKAGE_NAME)
}

/* --------------------------------- utils --------------------------------- */
async function runCmnd(key) {
    return vscode.commands.executeCommand(key)
}

async function setWhen(val) {
    return vscode.commands.executeCommand('setContext', 'pfrIsRunning', val)
}

function sortSelections(arr) {
    return arr.sort((a, b) => { // make sure its sorted correctly
        if (a.range.start.line > b.range.start.line) return 1
        if (b.range.start.line > a.range.start.line) return -1

        return 0
    })
}

function showMsg(msg) {
    return vscode.window.showInformationMessage(`Problems Fix Runner: ${msg}`)
}

exports.activate = activate

function deactivate() {
    nextEvent.dispose()
    stopEvent.dispose()
}

module.exports = {
    activate,
    deactivate
}
