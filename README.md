are you tired of having to fix error in your code one by one ?<br>
no more, now all u have to do is

- open quick input
- run `Problems Fix Runner`
- select the correct suggestion for each mistake/error

no more no less 💥

![demo](https://user-images.githubusercontent.com/7388088/72210739-cf0c1300-34c8-11ea-8239-1650ebdc1ec8.gif)

## Notes

- for severity code meaning check https://code.visualstudio.com/api/references/vscode-api#DiagnosticSeverity
- runner will stop
    - if window loses focus
    - if no selection was made (if `menuListType == quickfix`)
    - if command re-executed
