import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { spawn, ChildProcessWithoutNullStreams } from "child_process";

interface CodeConfig {
  id: string;
  displayName: string;
  fileExt: string;
  docsFile: string;
  runCommand: string;
  terminateCommand: string;
  executableConfigKey: string;
}

const codes: CodeConfig[] = [
  {
    id: "frapcon",
    displayName: "FRAPCON",
    fileExt: ".inp",
    docsFile: "frapconDocs.json",
    runCommand: "frapcon.run",
    terminateCommand: "frapcon.terminate",
    executableConfigKey: "frapcon.executablePath",
  },
  {
    id: "fraptran",
    displayName: "FRAPTRAN",
    fileExt: ".ftn",
    docsFile: "fraptranDocs.json",
    runCommand: "fraptran.run",
    terminateCommand: "fraptran.terminate",
    executableConfigKey: "fraptran.executablePath",
  },
  {
    id: "serpent",
    displayName: "SERPENT",
    fileExt: ".inp",
    docsFile: "serpentDocs.json",
    runCommand: "serpent.run",
    terminateCommand: "serpent.terminate",
    executableConfigKey: "serpent.executablePath",
  },
];

let activeProcesses: { [key: string]: ChildProcessWithoutNullStreams } = {};

function loadDocs(context: vscode.ExtensionContext, docsFile: string) {
  const docsPath = path.join(context.extensionPath, "docs", docsFile);
  if (!fs.existsSync(docsPath)) {
    return [];
  }
  return JSON.parse(fs.readFileSync(docsPath, "utf-8"));
}

export function activate(context: vscode.ExtensionContext) {
  codes.forEach((code) => {
    const docs = loadDocs(context, code.docsFile);

    // Completion provider
    context.subscriptions.push(
      vscode.languages.registerCompletionItemProvider(
        { language: code.id },
        {
          provideCompletionItems(
            document: vscode.TextDocument,
            position: vscode.Position
          ) {
            const items: vscode.CompletionItem[] = [];

            docs.forEach((entry: any) => {
              const kind = entry.required
                ? vscode.CompletionItemKind.EnumMember
                : vscode.CompletionItemKind.Variable;

              const item = new vscode.CompletionItem(entry.name, kind);

              (item as any).label = {
                label: entry.name,
                description: entry.required
                  ? `Required 🔴`
                  : `Optional`,
              };

              item.detail = entry.inputBlock
                ? `${entry.inputBlock}`
                : undefined;

              item.documentation = new vscode.MarkdownString(
                `**${entry.name}**\n\n${entry.description || ""}`
              );

              if (entry.required) {
                item.insertText = new vscode.SnippetString(
                  `${entry.name} = ,`
                );
              } else {
                item.insertText = `${entry.name} = `;
              }

              items.push(item);
            });

            return items;
          },
        },
        " ",
        "$"
      )
    );

    // Hover provider
    context.subscriptions.push(
      vscode.languages.registerHoverProvider({ language: code.id }, {
        provideHover(document, position) {
          const range = document.getWordRangeAtPosition(position, /[\w$]+/);
          if (!range) return;
          const word = document.getText(range);
          const match = docs.find((d: any) => d.name === word);
          if (match) {
            return new vscode.Hover(
              new vscode.MarkdownString(
                `**${match.name}**\n\n${match.description || ""}`
              )
            );
          }
        },
      })
    );

    // Run command
    context.subscriptions.push(
      vscode.commands.registerCommand(code.runCommand, async () => {
        if (activeProcesses[code.id]) {
          vscode.window.showWarningMessage(`${code.displayName} is already running.`);
          return;
        }

        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        await editor.document.save();

        const config = vscode.workspace.getConfiguration();
        const exePath = config.get<string>(code.executableConfigKey);

        if (!exePath || exePath.trim() === "") {
          vscode.window.showErrorMessage(`Executable path for ${code.displayName} not set. Please configure it in settings.`);
          return;
        }

        const filePath = editor.document.fileName;
        const process = spawn(exePath, [filePath], {
          cwd: path.dirname(filePath),
        });

        activeProcesses[code.id] = process;

        process.stdout.on("data", (data) => {
          vscode.window.showInformationMessage(`${code.displayName}: ${data}`);
        });

        process.stderr.on("data", (data) => {
          vscode.window.showErrorMessage(`${code.displayName} Error: ${data}`);
        });

        process.on("close", () => {
          vscode.window.showInformationMessage(`${code.displayName} finished.`);
          delete activeProcesses[code.id];
        });
      })
    );

    // Terminate command
    context.subscriptions.push(
      vscode.commands.registerCommand(code.terminateCommand, () => {
        const proc = activeProcesses[code.id];
        if (proc) {
          proc.kill();
          vscode.window.showWarningMessage(`${code.displayName} terminated.`);
          delete activeProcesses[code.id];
        } else {
          vscode.window.showInformationMessage(`No running ${code.displayName} process found.`);
        }
      })
    );

    // Status bar
    const runButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    runButton.text = `▶ ${code.displayName}`;
    runButton.command = code.runCommand;
    runButton.tooltip = `Run ${code.displayName}`;
    runButton.show();
    context.subscriptions.push(runButton);

    const terminateButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
    terminateButton.text = `⏹ ${code.displayName}`;
    terminateButton.command = code.terminateCommand;
    terminateButton.tooltip = `Terminate ${code.displayName}`;
    terminateButton.show();
    context.subscriptions.push(terminateButton);
  });
}

export function deactivate() {
  Object.values(activeProcesses).forEach((proc) => proc.kill());
  activeProcesses = {};
}
