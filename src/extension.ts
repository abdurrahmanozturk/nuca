import * as vscode from "vscode";
import { exec, ChildProcess } from "child_process";
import * as fs from "fs";
import * as path from "path";

let statusBarItem: vscode.StatusBarItem;
let runningProcess: ChildProcess | null = null;
let currentLang: string | null = null;

type KeywordMap = { [lang: string]: string[] };
let keywordMap: KeywordMap = {};

export function activate(context: vscode.ExtensionContext) {
  console.log("NUCA extension activated");

  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  context.subscriptions.push(statusBarItem);

  // Load keyword lists
  loadKeywords(context);

  // Register run commands
  context.subscriptions.push(
    vscode.commands.registerCommand("frapcon.run", () => runCode("frapcon")),
    vscode.commands.registerCommand("fraptran.run", () => runCode("fraptran")),
    vscode.commands.registerCommand("serpent.run", () => runCode("serpent")),
    vscode.commands.registerCommand("nuca.terminate", terminateProcess)
  );

  // React to editor/document changes
  vscode.window.onDidChangeActiveTextEditor(editor => {
    updateStatusBarForLanguage(editor?.document);
  }, null, context.subscriptions);

  vscode.workspace.onDidOpenTextDocument(doc => {
    updateStatusBarForLanguage(doc);
  }, null, context.subscriptions);

  // Initial setup
  updateStatusBarForLanguage(vscode.window.activeTextEditor?.document);
}

function loadKeywords(context: vscode.ExtensionContext) {
  const keywordsDir = path.join(context.extensionPath, "src", "keywords");

  ["frapcon", "fraptran", "serpent"].forEach(lang => {
    const filePath = path.join(keywordsDir, `${lang}.json`);
    try {
      const data = fs.readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(data);
      keywordMap[lang] = parsed[lang] || [];
    } catch (err) {
      console.warn(`Could not load keywords for ${lang}:`, err);
      keywordMap[lang] = [];
    }
  });
}

function detectCodeFromDoc(doc: vscode.TextDocument): string | null {
  const text = doc.getText().toLowerCase();

  // Strong hints from extensions
  if (doc.fileName.endsWith(".frpcon") || doc.fileName.endsWith(".frpcn")) return "frapcon";
  if (doc.fileName.endsWith(".frptrn") || doc.fileName.endsWith(".frptn")) return "fraptran";
  if (doc.fileName.endsWith(".srpnt") || doc.fileName.endsWith(".serpent")) return "serpent";

  // Keyword-based detection for *any* file type
  for (const lang in keywordMap) {
    for (const keyword of keywordMap[lang]) {
      if (text.includes(keyword.toLowerCase())) {
        return lang;
      }
    }
  }

  return null; // Unknown
}

function updateStatusBarForLanguage(doc?: vscode.TextDocument) {
  if (!doc) {
    statusBarItem.hide();
    currentLang = null;
    return;
  }

  const lang = detectCodeFromDoc(doc);
  if (!lang) {
    statusBarItem.hide();
    currentLang = null;
    return;
  }

  currentLang = lang;
  
  // Automatically set language mode if not already set
  if (doc.languageId !== lang) {
    vscode.languages.setTextDocumentLanguage(doc, lang);
  }


  if (runningProcess) {
    statusBarItem.text = "$(stop) Terminate " + lang.toUpperCase();
    statusBarItem.tooltip = `Terminate ${lang.toUpperCase()} process`;
    statusBarItem.command = "nuca.terminate";
  } else {
    statusBarItem.text = "$(play) Run " + lang.toUpperCase();
    statusBarItem.tooltip = `Run ${lang.toUpperCase()} on the active file`;
    statusBarItem.command = `${lang}.run`;
  }

  statusBarItem.show();
}

function runCode(lang: string) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage("No active editor");
    return;
  }

  const filePath = editor.document.uri.fsPath;
  let cmd = "";

  switch (lang) {
    case "frapcon":
      cmd = `frapcon ${filePath}`;
      break;
    case "fraptran":
      cmd = `fraptran ${filePath}`;
      break;
    case "serpent":
      cmd = `sss2 ${filePath}`;
      break;
  }

  vscode.window.showInformationMessage(`Running ${lang.toUpperCase()}...`);
  runningProcess = exec(cmd, (error, stdout, stderr) => {
    if (error) {
      vscode.window.showErrorMessage(`${lang.toUpperCase()} failed: ${error.message}`);
    } else {
      vscode.window.showInformationMessage(`${lang.toUpperCase()} finished successfully`);
    }

    runningProcess = null;
    updateStatusBarForLanguage(vscode.window.activeTextEditor?.document);
  });

  updateStatusBarForLanguage(vscode.window.activeTextEditor?.document);
}

function terminateProcess() {
  if (runningProcess) {
    runningProcess.kill();
    vscode.window.showInformationMessage("Process terminated");
    runningProcess = null;
    updateStatusBarForLanguage(vscode.window.activeTextEditor?.document);
  }
}

export function deactivate() {
  terminateProcess();
}
