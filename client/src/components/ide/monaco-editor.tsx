import { useEffect, useRef } from "react";
import { useIDE } from "@/hooks/useIDE";
import { initializeMonaco } from "@/lib/monaco";

export default function MonacoEditor() {
  const editorRef = useRef<HTMLDivElement>(null);
  const monacoEditorRef = useRef<any>(null);
  const { currentFile, updateFileContent } = useIDE();

  useEffect(() => {
    let monaco: any;
    let editor: any;

    const setupEditor = async () => {
      if (!editorRef.current) return;

      monaco = await initializeMonaco();
      
      editor = monaco.editor.create(editorRef.current, {
        value: currentFile?.content || "",
        language: getLanguageFromFileName(currentFile?.name || ""),
        theme: "vs-dark",
        automaticLayout: true,
        fontSize: 14,
        lineNumbers: "on",
        minimap: { enabled: true },
        scrollBeyondLastLine: false,
        wordWrap: "on",
        tabSize: 2,
        insertSpaces: true,
      });

      monacoEditorRef.current = editor;

      // Listen for content changes
      editor.onDidChangeModelContent(() => {
        const content = editor.getValue();
        if (currentFile) {
          updateFileContent(currentFile.id, content);
        }
      });
    };

    setupEditor();

    return () => {
      if (editor) {
        editor.dispose();
      }
    };
  }, []);

  useEffect(() => {
    if (monacoEditorRef.current && currentFile) {
      const currentValue = monacoEditorRef.current.getValue();
      if (currentValue !== currentFile.content) {
        monacoEditorRef.current.setValue(currentFile.content || "");
      }
      
      // Update language based on file extension
      const language = getLanguageFromFileName(currentFile.name);
      const model = monacoEditorRef.current.getModel();
      if (model) {
        const monaco = (window as any).monaco;
        monaco.editor.setModelLanguage(model, language);
      }
    }
  }, [currentFile]);

  const getLanguageFromFileName = (fileName: string): string => {
    const extension = fileName.split('.').pop()?.toLowerCase();
    switch (extension) {
      case 'js':
      case 'jsx':
        return 'javascript';
      case 'ts':
      case 'tsx':
        return 'typescript';
      case 'html':
      case 'htm':
        return 'html';
      case 'css':
        return 'css';
      case 'json':
        return 'json';
      case 'md':
      case 'markdown':
        return 'markdown';
      case 'py':
        return 'python';
      case 'java':
        return 'java';
      case 'cpp':
      case 'cc':
      case 'cxx':
        return 'cpp';
      case 'c':
        return 'c';
      case 'php':
        return 'php';
      case 'rb':
        return 'ruby';
      case 'go':
        return 'go';
      case 'rs':
        return 'rust';
      case 'xml':
        return 'xml';
      case 'yaml':
      case 'yml':
        return 'yaml';
      default:
        return 'plaintext';
    }
  };

  if (!currentFile) {
    return (
      <div className="flex-1 bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-slate-800 rounded-lg flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">📝</span>
          </div>
          <h3 className="text-lg font-medium text-gray-300 mb-2">No file selected</h3>
          <p className="text-gray-500">Open a file from the explorer to start editing</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-slate-900">
      <div ref={editorRef} className="h-full w-full" />
    </div>
  );
}
