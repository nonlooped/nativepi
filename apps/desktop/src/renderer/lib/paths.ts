export function absoluteProjectPath(projectDir: string, relativePath: string): string {
  return `${projectDir.replace(/[\\/]+$/, "")}\\${relativePath.replace(/^[/\\]+/, "").replace(/\//g, "\\")}`;
}

export function editorName(id: string): string {
  const names: Record<string, string> = {
    cursor: "Cursor",
    vscode: "Visual Studio Code",
    antigravity: "Google Antigravity",
    windsurf: "Windsurf",
    "vscode-insiders": "Visual Studio Code Insiders",
    vscodium: "VSCodium",
    zed: "Zed",
    "visual-studio": "Visual Studio",
    "sublime-text": "Sublime Text",
    "notepad-plus-plus": "Notepad++",
    "intellij-idea": "IntelliJ IDEA",
    webstorm: "WebStorm",
    rider: "JetBrains Rider",
    pycharm: "PyCharm",
    clion: "CLion",
    goland: "GoLand",
    phpstorm: "PhpStorm",
    rubymine: "RubyMine",
    rustrover: "RustRover",
    explorer: "Explorer",
  };
  return names[id] ?? "editor";
}
