# Change Log

## 0.0.1

- Initial release

## 0.0.2

- stop loop on window focus lose
- stop loop when re-running the command while the prev didnt finish

# 0.0.7

- add keybinding to automatically go to problem on active line

# 0.0.8

- based on [#88628](https://github.com/microsoft/vscode/issues/88628) u can now chose to show the suggestion list as
    1. quickfix :
        + pros:
            + native behavior "no extra work needed from the extension side"
        + cons:
            + cant jump to next problem without manually hiding the menu first
            + cant programmatically hide the menu
    2. suggestion:
        + pros: what **quickfix** cant do
        + cons:
            + any selected item will replace the text "no available api to disable that"
            + list would be filled with other suggestions too "no available api to get around that"
