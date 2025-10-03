"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const child_process_1 = require("child_process");
const codes = [
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
let activeProcesses = {};
function loadDocs(context, docsFile) {
    const docsPath = path.join(context.extensionPath, "docs", docsFile);
    if (!fs.existsSync(docsPath)) {
        return [];
    }
    return JSON.parse(fs.readFileSync(docsPath, "utf-8"));
}
function activate(context) {
    codes.forEach((code) => {
        const docs = loadDocs(context, code.docsFile);
        // Completion provider
        context.subscriptions.push(vscode.languages.registerCompletionItemProvider({ language: code.id }, {
            provideCompletionItems(document, position) {
                const items = [];
                docs.forEach((entry) => {
                    const kind = entry.required
                        ? vscode.CompletionItemKind.EnumMember
                        : vscode.CompletionItemKind.Variable;
                    const item = new vscode.CompletionItem(entry.name, kind);
                    item.label = {
                        label: entry.name,
                        description: entry.required
                            ? `Required 🔴`
                            : `Optional`,
                    };
                    item.detail = entry.inputBlock
                        ? `${entry.inputBlock}`
                        : undefined;
                    item.documentation = new vscode.MarkdownString(`**${entry.name}**\n\n${entry.description || ""}`);
                    if (entry.required) {
                        item.insertText = new vscode.SnippetString(`${entry.name} = ,`);
                    }
                    else {
                        item.insertText = `${entry.name} = `;
                    }
                    items.push(item);
                });
                return items;
            },
        }, " ", "$"));
        // Hover provider
        context.subscriptions.push(vscode.languages.registerHoverProvider({ language: code.id }, {
            provideHover(document, position) {
                const range = document.getWordRangeAtPosition(position, /[\w$]+/);
                if (!range)
                    return;
                const word = document.getText(range);
                const match = docs.find((d) => d.name === word);
                if (match) {
                    return new vscode.Hover(new vscode.MarkdownString(`**${match.name}**\n\n${match.description || ""}`));
                }
            },
        }));
        // Run command
        context.subscriptions.push(vscode.commands.registerCommand(code.runCommand, () => __awaiter(this, void 0, void 0, function* () {
            if (activeProcesses[code.id]) {
                vscode.window.showWarningMessage(`${code.displayName} is already running.`);
                return;
            }
            const editor = vscode.window.activeTextEditor;
            if (!editor)
                return;
            yield editor.document.save();
            const config = vscode.workspace.getConfiguration();
            const exePath = config.get(code.executableConfigKey);
            if (!exePath || exePath.trim() === "") {
                vscode.window.showErrorMessage(`Executable path for ${code.displayName} not set. Please configure it in settings.`);
                return;
            }
            const filePath = editor.document.fileName;
            const process = (0, child_process_1.spawn)(exePath, [filePath], {
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
        })));
        // Terminate command
        context.subscriptions.push(vscode.commands.registerCommand(code.terminateCommand, () => {
            const proc = activeProcesses[code.id];
            if (proc) {
                proc.kill();
                vscode.window.showWarningMessage(`${code.displayName} terminated.`);
                delete activeProcesses[code.id];
            }
            else {
                vscode.window.showInformationMessage(`No running ${code.displayName} process found.`);
            }
        }));
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
function deactivate() {
    Object.values(activeProcesses).forEach((proc) => proc.kill());
    activeProcesses = {};
}
//# sourceMappingURL=extension.js.map