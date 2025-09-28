import * as vscode from 'vscode';

export type LimitedSeverity = "warning" | "information" | "hint" | "none";

export function getConfig() {
  const cfg = vscode.workspace.getConfiguration("baselineLite");
  const coreProperties = cfg.get<string[]>("coreProperties", []);
  const severityForLimited = cfg.get<LimitedSeverity>("severityForLimited", "information");
  return { coreProperties, severityForLimited };
}
