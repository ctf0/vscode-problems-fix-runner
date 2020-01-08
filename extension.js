const vscode = require('vscode')
const PACKAGE_NAME = 'problems-fix-runner'
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

    let stop = true

    context.subscriptions.push(
        vscode.commands.registerCommand('pfr', async () => {
            if (outputChannel) {
                outputChannel.clear()
            }

            stop = false
            let editor = vscode.window.activeTextEditor
            let { document: aDocument } = editor
            let diagnostics = sortSelections(
                vscode.languages.getDiagnostics(aDocument.uri).filter((e) => {
                    return config.list.includes(e.source)
                })
            )

            // nothing found
            if (!diagnostics.length) {
                return showMsg('Nothing Found')
            }

            // debug
            if (config.debug) {
                for (const info of diagnostics) {
                    let { severity, source, message } = info

                    showDebugMsg(`source: ${source}`)
                    showDebugMsg(`message: ${message}`)
                    showDebugMsg(`severity: ${severity}`)
                    showDebugMsg('--------------------')
                }
            }

            for (let i = 0; i < diagnostics.length; i++) {
                const info = diagnostics[i]
                let { range: iRange } = info

                editor.selection = new vscode.Selection(iRange.end, iRange.end)
                await runCmnd('editor.action.quickFix')

                await new Promise((resolve) => {
                    let timer

                    // TODO
                    // if no selection made, hide suggestion menu and go to next
                    timer = setTimeout(() => {
                        runCmnd('hideSuggestWidget')
                        // resolve()
                    }, config.waitFor * 1000)

                    vscode.workspace.onDidChangeTextDocument((e) => {
                        if (!stop && e) {
                            let { document, contentChanges } = e

                            if (document == aDocument && contentChanges.length && contentChanges[0].range.isEqual(iRange)) {
                                clearTimeout(timer)
                                resolve()
                            }
                        }
                    })
                })
            }

            stop = true

            return showMsg('All Done')
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

function deactivate() { }

module.exports = {
    activate,
    deactivate
}
