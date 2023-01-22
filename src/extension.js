const vscode = require('vscode');
const PACKAGE_NAME = 'problemsFixRunner';
const debounce = require('lodash.debounce');
const {registerProviders} = require('./cl');

const nextEvent = new vscode.EventEmitter();
const stopEvent = new vscode.EventEmitter();
let running = false;
let config = {};
let outputChannel;

/**
 * @param {vscode.ExtensionContext} context
 */
async function activate(context) {
    readConfig();
    resetOutputChannel();

    // on config change
    vscode.workspace.onDidChangeConfiguration(async (e) => {
        if (e.affectsConfiguration(PACKAGE_NAME)) {
            readConfig();

            if (!config.debug) {
                resetOutputChannel();
            }
        }
    });

    // on window change
    vscode.window.onDidChangeWindowState((e) => {
        if (!e.focused) {
            stopEvent.fire(undefined);
        }
    });

    // on file change
    vscode.window.onDidChangeActiveTextEditor((e) => stopEvent.fire(undefined));

    context.subscriptions.push(vscode.commands.registerCommand('pfr', doStuff));
    context.subscriptions.push(vscode.commands.registerCommand('pfr.next', () => nextEvent.fire(undefined)));
    context.subscriptions.push(vscode.commands.registerCommand('pfr.lineProblem', lineProblem));
}

async function doStuff(e, lineDiagnostics = null) {
    await setWhen(true);

    // in case of double running the cmnd
    if (running) {
        return stopEvent.fire(undefined);
    }

    running = true;

    let editor = vscode.window.activeTextEditor;
    let {document: aDocument} = editor;
    let diagnostics = lineDiagnostics || vscode.languages.getDiagnostics(aDocument.uri);
    let isASuggestionList = config.menuListType == 'suggestion';

    // debug
    if (config.debug) {
        // clear old output
        if (outputChannel) {
            outputChannel.show(true);
            outputChannel.clear();
        }

        for (const info of diagnostics) {
            let {severity, source, message, code} = info;

            showDebugMsg(`source: ${source}`);
            showDebugMsg(`code: ${code}`);
            showDebugMsg(`message: ${message}`);
            showDebugMsg(`severity: ${severity}`);
            showDebugMsg('--------------------');
        }
    }

    // we need to inverse the list because of the range change when using completion list
    diagnostics = sortSelections(diagnostics.filter((e) => config.list.includes(e.source || e.code))).reverse();

    // nothing found
    if (!diagnostics.length) {
        running = false;
        await setWhen(false);

        if (lineDiagnostics) {
            if (isASuggestionList) {
                await runCmnd('editor.action.triggerSuggest');
            } else {
                await runCmnd('editor.action.quickFix');
            }

            return;
        }

        return showMsg('Nothing Found');
    }

    let disposables = [];

    for (let i = 0; i < diagnostics.length; i++) {
        // stop loop
        stopEvent.event((e) => {
            if (running) {
                running = false;
            }
        });

        if (!running) {
            break;
        }

        const info = diagnostics[i];
        let {range, source, code} = info;
        editor.selection = await new vscode.Selection(range.end, range.end);

        if (isASuggestionList) {
            disposables.push(await registerProviders(aDocument, range, source || code, config));

            await runCmnd('editor.action.triggerSuggest');
        } else {
            await runCmnd('editor.action.quickFix');
        }

        await new Promise((resolve) => {
            // if no selection made, go next
            let timer = setTimeout(async () => {
                if (!isASuggestionList) {
                    stopEvent.fire(undefined);
                }

                await cleanUp();
            }, config.waitFor * 1000);

            // stop loop
            stopEvent.event(async (e) => {
                running = false;
                await cleanUp();
            });

            // force go next
            nextEvent.event(async (e) => {
                await cleanUp();
            });

            async function cleanUp() {
                clearTimeout(timer);
                await runCmnd('hideSuggestWidget');
                disposables.forEach((e) => e.dispose());
                resolve();
            }

            // go next after change
            disposables.push(
                vscode.workspace.onDidChangeTextDocument(
                    debounce(async (e) => {
                        if (running && e) {
                            let {document, contentChanges} = e;

                            if (document == aDocument && contentChanges.length) {
                                await cleanUp();
                            }
                        }
                    }, 50),
                ),
            );
        });
    }

    // reached the list end
    await runCmnd('hideSuggestWidget');
    running = false;
    disposables.forEach((e) => e.dispose());
    await setWhen(false);

    await showMsg(running ? 'All Done' : 'Runner Stopped');
}

async function lineProblem(e) {
    let editor = vscode.window.activeTextEditor;
    let {document: aDocument, selection} = editor;

    let diagnostics = vscode.languages.getDiagnostics(aDocument.uri)
        .filter((item) => item.range.start.line == selection.start.line);

    if (diagnostics.length) {
        await doStuff(null, diagnostics);
    } else {
        await runCmnd('editor.action.quickFix');
    }
}

/* ---------------------------------- debug --------------------------------- */
function showDebugMsg(text) {
    if (outputChannel) {
        outputChannel.appendLine(text);
    }
}

function resetOutputChannel() {
    if (outputChannel) {
        outputChannel.dispose();
        outputChannel = undefined;
    }

    if (config.debug) {
        outputChannel = vscode.window.createOutputChannel('Problems Fix Runner');
    }
}

/* --------------------------------- config --------------------------------- */
function readConfig() {
    config = vscode.workspace.getConfiguration(PACKAGE_NAME);
}

/* --------------------------------- utils --------------------------------- */
async function runCmnd(key) {
    return vscode.commands.executeCommand(key);
}

async function setWhen(val) {
    return vscode.commands.executeCommand('setContext', 'pfrIsRunning', val);
}

function sortSelections(arr) {
    return arr.sort((a, b) => { // make sure its sorted correctly
        if (a.range.start.line > b.range.start.line) return 1;
        if (b.range.start.line > a.range.start.line) return -1;

        return 0;
    });
}

function showMsg(msg) {
    return vscode.window.showInformationMessage(`Problems Fix Runner: ${msg}`);
}

async function deactivate() {
    await setWhen(false);

    nextEvent.dispose();
    stopEvent.dispose();
}

module.exports = {
    activate,
    deactivate,
};
