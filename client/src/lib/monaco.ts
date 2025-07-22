export async function initializeMonaco() {
  // Import Monaco Editor
  const monaco = await import('monaco-editor');
  
  // Configure Monaco paths for web workers
  (window as any).MonacoEnvironment = {
    getWorkerUrl: function (_moduleId: any, label: string) {
      if (label === 'json') {
        return '/monaco-editor/min/vs/language/json/json.worker.js';
      }
      if (label === 'css' || label === 'scss' || label === 'less') {
        return '/monaco-editor/min/vs/language/css/css.worker.js';
      }
      if (label === 'html' || label === 'handlebars' || label === 'razor') {
        return '/monaco-editor/min/vs/language/html/html.worker.js';
      }
      if (label === 'typescript' || label === 'javascript') {
        return '/monaco-editor/min/vs/language/typescript/ts.worker.js';
      }
      return '/monaco-editor/min/vs/editor/editor.worker.js';
    }
  };

  // Configure editor themes
  monaco.editor.defineTheme('shetty-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '6A9955' },
      { token: 'keyword', foreground: 'C586C0' },
      { token: 'string', foreground: 'CE9178' },
      { token: 'number', foreground: 'B5CEA8' },
      { token: 'regexp', foreground: 'D16969' },
      { token: 'type', foreground: '4EC9B0' },
      { token: 'class', foreground: '4EC9B0' },
      { token: 'function', foreground: 'DCDCAA' },
      { token: 'variable', foreground: '9CDCFE' },
    ],
    colors: {
      'editor.background': '#1E1E1E',
      'editor.foreground': '#D4D4D4',
      'editorLineNumber.foreground': '#858585',
      'editor.selectionBackground': '#264F78',
      'editor.inactiveSelectionBackground': '#3A3D41',
      'editorCursor.foreground': '#AEAFAD',
      'editor.lineHighlightBackground': '#2A2D2E',
    }
  });

  // Set default theme
  monaco.editor.setTheme('shetty-dark');

  return monaco;
}
