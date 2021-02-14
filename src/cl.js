const vscode = require('vscode');

async function registerProviders({ uri, languageId }, range, ext, config) {
    let regex = new RegExp(config.exclude.join('|'));
    let list = await vscode.commands.executeCommand('vscode.executeCodeActionProvider', uri, range);
    list = list.filter((e) => e.kind.value == 'quickfix');

    let provider = await vscode.languages.registerCompletionItemProvider(
        { language: languageId },
        {
            provideCompletionItems() {
                let arr = [];

                for (let i = 0; i < list.length; i++) {
                    const item = list[i];
                    let { title, command } = item;

                    if (regex.test(title)) {
                        continue;
                    }

                    let comp = new vscode.CompletionItem(title, vscode.CompletionItemKind.Text);
                    comp.detail = ext;
                    comp.documentation = title;
                    // comp.command = command // affects the replacement range

                    arr.push(comp);
                }

                return arr;
            },
        },
    );

    return provider;
}

module.exports = {
    registerProviders,
};
