import * as monaco from 'monaco-editor';
import { loader } from '@monaco-editor/loader';

// Configure Monaco Editor with VS Code-level features
export async function initializeMonaco() {
  // Set up Monaco loader
  loader.config({
    paths: {
      vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs'
    }
  });

  const monacoInstance = await loader.init();

  // Configure TypeScript compiler options for IntelliSense
  monacoInstance.languages.typescript.typescriptDefaults.setCompilerOptions({
    target: monacoInstance.languages.typescript.ScriptTarget.ES2020,
    allowNonTsExtensions: true,
    moduleResolution: monacoInstance.languages.typescript.ModuleResolutionKind.NodeJs,
    module: monacoInstance.languages.typescript.ModuleKind.CommonJS,
    noEmit: true,
    esModuleInterop: true,
    jsx: monacoInstance.languages.typescript.JsxEmit.React,
    reactNamespace: 'React',
    allowJs: true,
    typeRoots: ['node_modules/@types']
  });

  // Configure JavaScript compiler options
  monacoInstance.languages.typescript.javascriptDefaults.setCompilerOptions({
    target: monacoInstance.languages.typescript.ScriptTarget.ES2020,
    allowNonTsExtensions: true,
    allowJs: true,
    checkJs: true
  });

  // Add common type definitions
  const commonTypes = `
    declare global {
      interface Window {
        [key: string]: any;
      }
      interface Console {
        log(...args: any[]): void;
        error(...args: any[]): void;
        warn(...args: any[]): void;
        info(...args: any[]): void;
      }
      const console: Console;
      const window: Window;
      const document: Document;
      const process: any;
      const require: any;
      const module: any;
      const exports: any;
      const __dirname: string;
      const __filename: string;
    }
  `;

  monacoInstance.languages.typescript.typescriptDefaults.addExtraLib(
    commonTypes,
    'ts:globals.d.ts'
  );

  // Define custom themes
  monacoInstance.editor.defineTheme('shetty-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '6A9955', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'C586C0', fontStyle: 'bold' },
      { token: 'string', foreground: 'CE9178' },
      { token: 'number', foreground: 'B5CEA8' },
      { token: 'regexp', foreground: 'D16969' },
      { token: 'type', foreground: '4EC9B0' },
      { token: 'class', foreground: '4EC9B0' },
      { token: 'function', foreground: 'DCDCAA' },
      { token: 'variable', foreground: '9CDCFE' },
      { token: 'constant', foreground: '4FC1FF' },
      { token: 'property', foreground: '9CDCFE' },
      { token: 'operator', foreground: 'D4D4D4' },
      { token: 'delimiter', foreground: 'D4D4D4' },
    ],
    colors: {
      'editor.background': '#0f172a',
      'editor.foreground': '#cbd5e1',
      'editorLineNumber.foreground': '#64748b',
      'editorLineNumber.activeForeground': '#cbd5e1',
      'editor.selectionBackground': '#334155',
      'editor.inactiveSelectionBackground': '#1e293b',
      'editorCursor.foreground': '#cbd5e1',
      'editor.lineHighlightBackground': '#1e293b',
      'editorWhitespace.foreground': '#475569',
      'editorIndentGuide.background': '#334155',
      'editorIndentGuide.activeBackground': '#475569',
      'editor.findMatchBackground': '#fbbf24',
      'editor.findMatchHighlightBackground': '#f59e0b',
      'editor.findRangeHighlightBackground': '#374151',
      'editorBracketMatch.background': '#374151',
      'editorBracketMatch.border': '#6b7280',
      'scrollbarSlider.background': '#374151',
      'scrollbarSlider.hoverBackground': '#4b5563',
      'scrollbarSlider.activeBackground': '#6b7280',
    }
  });

  monacoInstance.editor.defineTheme('shetty-light', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '008000', fontStyle: 'italic' },
      { token: 'keyword', foreground: '0000ff', fontStyle: 'bold' },
      { token: 'string', foreground: 'a31515' },
      { token: 'number', foreground: '098658' },
      { token: 'regexp', foreground: '811f3f' },
      { token: 'type', foreground: '267f99' },
      { token: 'class', foreground: '267f99' },
      { token: 'function', foreground: '795e26' },
      { token: 'variable', foreground: '001080' },
      { token: 'constant', foreground: '0070c1' },
      { token: 'property', foreground: '001080' },
    ],
    colors: {
      'editor.background': '#ffffff',
      'editor.foreground': '#000000',
      'editorLineNumber.foreground': '#237893',
      'editor.selectionBackground': '#add6ff',
      'editor.inactiveSelectionBackground': '#e5ebf1',
    }
  });

  // Set default theme
  monacoInstance.editor.setTheme('shetty-dark');

  // Register custom commands
  monacoInstance.editor.addCommand({
    id: 'shetty.formatDocument',
    label: 'Format Document',
    keybindings: [
      monacoInstance.KeyMod.Shift | monacoInstance.KeyMod.Alt | monacoInstance.KeyCode.KeyF
    ],
    contextMenuGroupId: 'modification',
    contextMenuOrder: 1.5,
    run: (editor) => {
      editor.getAction('editor.action.formatDocument')?.run();
    }
  });

  // Enable all VS Code-like features
  return monacoInstance;
}

// Enhanced editor options for VS Code-level experience
export const getAdvancedEditorOptions = (language: string): monaco.editor.IStandaloneEditorConstructionOptions => ({
  // Basic options
  language,
  theme: 'shetty-dark',
  fontSize: 14,
  fontFamily: '"JetBrains Mono", "Fira Code", "SF Mono", Monaco, Consolas, "Ubuntu Mono", monospace',
  fontWeight: '400',
  lineHeight: 1.5,
  letterSpacing: 0.5,
  
  // Layout and behavior
  automaticLayout: true,
  wordWrap: 'on',
  wordWrapColumn: 120,
  wrappingIndent: 'indent',
  scrollBeyondLastLine: false,
  smoothScrolling: true,
  cursorBlinking: 'blink',
  cursorStyle: 'line',
  cursorWidth: 2,
  
  // Line numbers and folding
  lineNumbers: 'on',
  lineNumbersMinChars: 3,
  glyphMargin: true,
  folding: true,
  foldingStrategy: 'indentation',
  foldingHighlight: true,
  unfoldOnClickAfterEndOfLine: true,
  
  // Minimap
  minimap: {
    enabled: true,
    side: 'right',
    showSlider: 'mouseover',
    renderCharacters: true,
    maxColumn: 120,
    scale: 1
  },
  
  // Scrollbars
  scrollbar: {
    vertical: 'visible',
    horizontal: 'visible',
    arrowSize: 11,
    useShadows: true,
    verticalHasArrows: false,
    horizontalHasArrows: false,
    verticalScrollbarSize: 14,
    horizontalScrollbarSize: 14
  },
  
  // Selection and highlighting
  selectionHighlight: true,
  occurrencesHighlight: true,
  renderSelectionWithRoundedCorners: true,
  roundedSelection: true,
  
  // Indentation and whitespace
  tabSize: 2,
  insertSpaces: true,
  detectIndentation: true,
  trimAutoWhitespace: true,
  renderWhitespace: 'selection',
  renderControlCharacters: false,
  renderIndentGuides: true,
  highlightActiveIndentGuide: true,
  
  // Bracket matching
  matchBrackets: 'always',
  bracketPairColorization: {
    enabled: true
  },
  
  // Find and replace
  find: {
    cursorMoveOnType: true,
    seedSearchStringFromSelection: 'always',
    autoFindInSelection: 'never',
    addExtraSpaceOnTop: true
  },
  
  // Suggestions and IntelliSense
  quickSuggestions: {
    other: true,
    comments: false,
    strings: false
  },
  quickSuggestionsDelay: 100,
  suggestOnTriggerCharacters: true,
  acceptSuggestionOnEnter: 'on',
  acceptSuggestionOnCommitCharacter: true,
  snippetSuggestions: 'top',
  wordBasedSuggestions: true,
  suggestSelection: 'first',
  
  // Hover and tooltips
  hover: {
    enabled: true,
    delay: 300,
    sticky: true
  },
  
  // Links
  links: true,
  
  // Multi-cursor
  multiCursorModifier: 'alt',
  multiCursorMergeOverlapping: true,
  
  // Context menu
  contextmenu: true,
  
  // Code lens
  codeLens: true,
  
  // Drag and drop
  dragAndDrop: true,
  
  // Accessibility
  accessibilitySupport: 'auto',
  
  // Performance
  stopRenderingLineAfter: 10000,
  
  // Advanced features
  definitionLinkOpensInPeek: false,
  gotoLocation: {
    multipleReferences: 'peek',
    multipleDefinitions: 'peek',
    multipleDeclarations: 'peek',
    multipleImplementations: 'peek',
    multipleTypeDefinitions: 'peek'
  },
  
  // Format on type/paste
  formatOnType: true,
  formatOnPaste: true,
  
  // Auto closing
  autoClosingBrackets: 'always',
  autoClosingQuotes: 'always',
  autoSurround: 'languageDefined',
  
  // Rulers
  rulers: [80, 120],
  
  // Comments
  comments: {
    insertSpace: true,
    ignoreEmptyLines: true
  }
});

// Language-specific configurations
export const getLanguageConfig = (language: string) => {
  const configs: Record<string, any> = {
    typescript: {
      tabSize: 2,
      insertSpaces: true,
      autoClosingBrackets: 'always',
      autoClosingQuotes: 'always',
      formatOnType: true,
      formatOnPaste: true
    },
    javascript: {
      tabSize: 2,
      insertSpaces: true,
      autoClosingBrackets: 'always',
      autoClosingQuotes: 'always',
      formatOnType: true,
      formatOnPaste: true
    },
    python: {
      tabSize: 4,
      insertSpaces: true,
      trimAutoWhitespace: true,
      rulers: [79, 120]
    },
    html: {
      tabSize: 2,
      insertSpaces: true,
      formatOnType: true,
      autoClosingBrackets: 'always',
      autoClosingQuotes: 'always'
    },
    css: {
      tabSize: 2,
      insertSpaces: true,
      formatOnType: true,
      autoClosingBrackets: 'always'
    },
    json: {
      tabSize: 2,
      insertSpaces: true,
      formatOnType: true,
      formatOnPaste: true
    }
  };
  
  return configs[language] || {};
};