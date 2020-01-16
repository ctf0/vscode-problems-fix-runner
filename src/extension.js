const vscode = require('vscode')
const PACKAGE_NAME = 'problems-fix-runner'
const debounce = require('lodash.debounce')
const { registerProviders } = require('./cl')

const nextEvent = new vscode.EventEmitter()
const stopEvent = new vscode.EventEmitter()
let running = false
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
    vscode.window.onDidChangeWindowState((e) => {
        if (!e.focused) {
            stopEvent.fire()
        }
    })

    // on file change
    vscode.window.onDidChangeActiveTextEditor((e) => stopEvent.fire())

    context.subscriptions.push(vscode.commands.registerCommand('pfr', doStuff))
    context.subscriptions.push(vscode.commands.registerCommand('pfr.next', () => nextEvent.fire()))
    context.subscriptions.push(vscode.commands.registerCommand('pfr.lineProblem', smartFixLineProblem))
}

async function doStuff(e) {
    await setWhen(true)

    // in case of double running the cmnd
    if (running) {
        return stopEvent.fire()
    }

    // clear old output
    if (outputChannel) {
        outputChannel.show(true)
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

    // we need to inverse the list because of the range change when using completion list
    diagnostics = sortSelections(diagnostics.filter((e) => config.list.includes(e.source || e.code))).reverse()

    // nothing found
    if (!diagnostics.length) {
        running = false
        await setWhen(false)

        return showMsg('Nothing Found')
    }

    let disposables = []
    let isASuggestionList = config.menuListType == 'suggestion'

    for (let i = 0; i < diagnostics.length; i++) {
        // stop loop
        stopEvent.event((e) => {
            if (running) {
                running = false
            }
        })

        if (!running) {
            break
        }

        const info = diagnostics[i]
        let { range, source, code } = info
        editor.selection = await new vscode.Selection(range.start, range.start)

        if (isASuggestionList) {
            disposables.push(await registerProviders(aDocument, range, source || code, config))

            await runCmnd('editor.action.triggerSuggest')
        } else {
            await runCmnd('editor.action.quickFix')
        }

        await new Promise((resolve) => {
            function cleanUp() {
                clearTimeout(timer)
                runCmnd('hideSuggestWidget')
                disposables.forEach((e) => e.dispose())
                resolve()
            }

            // if no selection made, go next
            let timer = setTimeout(() => {
                if (!isASuggestionList) {
                    stopEvent.fire()
                }

                cleanUp()
            }, config.waitFor * 1000)

            // stop loop
            stopEvent.event((e) => {
                running = false
                cleanUp()
            })

            // force go next
            nextEvent.event((e) => {
                cleanUp()
            })

            // go next after change
            disposables.push(
                vscode.workspace.onDidChangeTextDocument(
                    debounce((e) => {
                        if (running && e) {
                            let { document, contentChanges } = e

                            if (document == aDocument && contentChanges.length) {
                                cleanUp()
                            }
                        }
                    }, 50)
                )
            )
        })
    }

    // reached the list end
    await runCmnd('hideSuggestWidget')
    disposables.forEach((e) => e.dispose())
    showMsg(running ? 'All Done' : 'Runner Stopped')
    setWhen(false)
    running = false
}

function smartFixLineProblem(e) {
    let editor = vscode.window.activeTextEditor
    let { document, selection } = editor
    let { start, end } = selection
    let range = new vscode.Range(start, end)

    let diagnostics = vscode.languages.getDiagnostics(document.uri)
        .filter((item) => item.range.start.line == selection.start.line && range.isSingleLine)

    if (diagnostics.length) {
        diagnostics.map((item) => {
            let range = item.range

            editor.selection = new vscode.Selection(range.end, range.end)
            runCmnd('editor.action.quickFix')
        })
    } else {
        runCmnd('editor.action.quickFix')
    }
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
