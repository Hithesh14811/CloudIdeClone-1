import { useEffect, useRef, useState, useCallback } from 'react';
import Editor, { Monaco } from '@monaco-editor/react';
import { useToast } from '@/hooks/use-toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { initializeMonaco, getAdvancedEditorOptions, getLanguageConfig } from '@/lib/monaco-config';
import { Button } from '@/components/ui/button';
import { Search, Replace, Settings, Maximize2, Minimize2, RotateCcw, Save } from 'lucide-react';
import * as monaco from 'monaco-editor';

interface FileNode {
  id: number;
  name: string;
  type: 'file' | 'folder';
  path: string;
  content?: string;
  parentId?: number;
}

interface MonacoCodeEditorProps {
  file?: FileNode;
  projectId: number;
}

const getLanguageFromFilename = (filename: string): string => {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'js':
    case 'jsx':
      return 'javascript';
    case 'ts':
    case 'tsx':
      return 'typescript';
    case 'py':
      return 'python';
    case 'html':
      return 'html';
    case 'css':
    case 'scss':
    case 'sass':
      return 'css';
    case 'json':
      return 'json';
    case 'md':
      return 'markdown';
    case 'xml':
      return 'xml';
    case 'sql':
      return 'sql';
    case 'yaml':
    case 'yml':
      return 'yaml';
    case 'sh':
    case 'bash':
      return 'shell';
    case 'php':
      return 'php';
    case 'java':
      return 'java';
    case 'c':
      return 'c';
    case 'cpp':
    case 'cc':
    case 'cxx':
      return 'cpp';
    case 'cs':
      return 'csharp';
    case 'go':
      return 'go';
    case 'rs':
      return 'rust';
    case 'rb':
      return 'ruby';
    case 'swift':
      return 'swift';
    case 'kt':
      return 'kotlin';
    case 'dart':
      return 'dart';
    default:
      return 'plaintext';
  }
};

export default function MonacoCodeEditor({ file, projectId }: MonacoCodeEditorProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout>();
  const [isMaximized, setIsMaximized] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [editorTheme, setEditorTheme] = useState<'shetty-dark' | 'shetty-light'>('shetty-dark');
  const [fontSize, setFontSize] = useState(14);
  const [minimap, setMinimap] = useState(true);
  const [wordWrap, setWordWrap] = useState<'on' | 'off'>('on');

  // Update file content mutation
  const updateFileMutation = useMutation({
    mutationFn: async ({ fileId, content }: { fileId: number; content: string }) => {
      return apiRequest('PUT', `/api/files/${fileId}`, { content });
    },
    onSuccess: () => {
      setHasUnsavedChanges(false);
      queryClient.invalidateQueries({ queryKey: ['project-files', projectId] });
      toast({
        title: 'File Saved',
        description: 'Your changes have been saved successfully.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Save Failed',
        description: error.message || 'Failed to save file',
        variant: 'destructive'
      });
    },
  });

  const handleEditorChange = useCallback((value: string | undefined) => {
    if (!file || !value) return;

    setHasUnsavedChanges(true);

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Debounced autosave - save after 2 seconds of no changes
    saveTimeoutRef.current = setTimeout(() => {
      updateFileMutation.mutate({
        fileId: file.id,
        content: value,
      });
    }, 2000);
  }, [file, updateFileMutation]);

  const handleManualSave = useCallback(() => {
    if (!file || !editorRef.current) return;

    const content = editorRef.current.getValue();
    updateFileMutation.mutate({
      fileId: file.id,
      content,
    });
  }, [file, updateFileMutation]);

  const handleEditorDidMount = useCallback((editor: monaco.editor.IStandaloneCodeEditor, monaco: Monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Add keyboard shortcuts
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      handleManualSave();
    });

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyF, () => {
      editor.getAction('actions.find')?.run();
    });

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyF, () => {
      editor.getAction('editor.action.startFindReplaceAction')?.run();
    });

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyD, () => {
      editor.getAction('editor.action.addSelectionToNextFindMatch')?.run();
    });

    editor.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.UpArrow, () => {
      editor.getAction('editor.action.moveLinesUpAction')?.run();
    });

    editor.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.DownArrow, () => {
      editor.getAction('editor.action.moveLinesDownAction')?.run();
    });

    // Focus the editor
    editor.focus();
  }, [handleManualSave]);

  const toggleMaximize = useCallback(() => {
    setIsMaximized(!isMaximized);
  }, [isMaximized]);

  const openFindReplace = useCallback(() => {
    if (editorRef.current) {
      editorRef.current.getAction('editor.action.startFindReplaceAction')?.run();
    }
  }, []);

  const openSearch = useCallback(() => {
    if (editorRef.current) {
      editorRef.current.getAction('actions.find')?.run();
    }
  }, []);

  const formatDocument = useCallback(() => {
    if (editorRef.current) {
      editorRef.current.getAction('editor.action.formatDocument')?.run();
    }
  }, []);

  const toggleTheme = useCallback(() => {
    const newTheme = editorTheme === 'shetty-dark' ? 'shetty-light' : 'shetty-dark';
    setEditorTheme(newTheme);
    if (monacoRef.current) {
      monacoRef.current.editor.setTheme(newTheme);
    }
  }, [editorTheme]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // Handle keyboard shortcuts at component level
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleManualSave();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleManualSave]);

  if (!file) {
    return (
      <div className="flex-1 bg-slate-900 flex items-center justify-center">
        <div className="text-center text-gray-400">
          <div className="mb-4">
            <svg
              className="w-16 h-16 mx-auto text-gray-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-300 mb-2">No File Selected</h3>
          <p className="text-sm text-gray-500">
            Select a file from the explorer to start editing
          </p>
          <div className="mt-4 text-xs text-gray-600">
            <p>🔥 <strong>VS Code-level features available:</strong></p>
            <p>• IntelliSense & Auto-completion</p>
            <p>• Search & Replace (Ctrl+F, Ctrl+H)</p>
            <p>• Multi-cursor editing (Alt+Click)</p>
            <p>• Code folding & Minimap</p>
            <p>• Go to Definition (F12)</p>
            <p>• Format Document (Shift+Alt+F)</p>
          </div>
        </div>
      </div>
    );
  }

  if (file.type === 'folder') {
    return (
      <div className="flex-1 bg-slate-900 flex items-center justify-center">
        <div className="text-center text-gray-400">
          <div className="mb-4">
            <svg
              className="w-16 h-16 mx-auto text-gray-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1}
                d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-300 mb-2">Folder Selected</h3>
          <p className="text-sm text-gray-500">
            Please select a file to edit its contents
          </p>
        </div>
      </div>
    );
  }

  const language = getLanguageFromFilename(file.name);
  const editorOptions = {
    ...getAdvancedEditorOptions(language),
    ...getLanguageConfig(language),
    theme: editorTheme,
    fontSize,
    minimap: { enabled: minimap },
    wordWrap,
  };

  return (
    <div className={`bg-slate-900 relative flex flex-col ${isMaximized ? 'fixed inset-0 z-50' : 'flex-1'}`}>
      {/* Editor Toolbar */}
      <div className="bg-slate-800 border-b border-slate-700 px-4 py-2 flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${hasUnsavedChanges ? 'bg-yellow-400' : 'bg-green-400'}`} />
            <span className="text-sm font-medium text-gray-200">
              {file.name}
              {hasUnsavedChanges && ' •'}
            </span>
            <span className="text-xs text-gray-500 bg-slate-700 px-2 py-1 rounded">
              {language.toUpperCase()}
            </span>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-gray-400 hover:text-gray-200"
            onClick={openSearch}
            title="Search (Ctrl+F)"
          >
            <Search className="w-3 h-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-gray-400 hover:text-gray-200"
            onClick={openFindReplace}
            title="Find & Replace (Ctrl+H)"
          >
            <Replace className="w-3 h-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-gray-400 hover:text-gray-200"
            onClick={formatDocument}
            title="Format Document (Shift+Alt+F)"
          >
            <RotateCcw className="w-3 h-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-gray-400 hover:text-gray-200"
            onClick={handleManualSave}
            title="Save (Ctrl+S)"
            disabled={updateFileMutation.isPending}
          >
            <Save className="w-3 h-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-gray-400 hover:text-gray-200"
            onClick={() => setShowSettings(!showSettings)}
            title="Editor Settings"
          >
            <Settings className="w-3 h-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-gray-400 hover:text-gray-200"
            onClick={toggleMaximize}
            title={isMaximized ? "Exit Fullscreen" : "Fullscreen"}
          >
            {isMaximized ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
          </Button>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="bg-slate-800 border-b border-slate-700 p-4 shrink-0">
          <div className="grid grid-cols-4 gap-4 text-sm">
            <div>
              <label className="block text-gray-300 mb-1">Theme</label>
              <select
                value={editorTheme}
                onChange={(e) => setEditorTheme(e.target.value as 'shetty-dark' | 'shetty-light')}
                className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-gray-200"
              >
                <option value="shetty-dark">Dark Theme</option>
                <option value="shetty-light">Light Theme</option>
              </select>
            </div>
            <div>
              <label className="block text-gray-300 mb-1">Font Size</label>
              <select
                value={fontSize}
                onChange={(e) => setFontSize(parseInt(e.target.value))}
                className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-gray-200"
              >
                <option value={12}>12px</option>
                <option value={14}>14px</option>
                <option value={16}>16px</option>
                <option value={18}>18px</option>
                <option value={20}>20px</option>
              </select>
            </div>
            <div>
              <label className="block text-gray-300 mb-1">Word Wrap</label>
              <select
                value={wordWrap}
                onChange={(e) => setWordWrap(e.target.value as 'on' | 'off')}
                className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-gray-200"
              >
                <option value="on">On</option>
                <option value="off">Off</option>
              </select>
            </div>
            <div>
              <label className="block text-gray-300 mb-1">Minimap</label>
              <button
                onClick={() => setMinimap(!minimap)}
                className={`w-full px-2 py-1 rounded text-sm ${
                  minimap 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-slate-700 border border-slate-600 text-gray-200'
                }`}
              >
                {minimap ? 'Enabled' : 'Disabled'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Editor */}
      <div className="flex-1 relative">
        <Editor
          height="100%"
          language={language}
          path={file.path}
          value={file.content || ''}
          onChange={handleEditorChange}
          onMount={handleEditorDidMount}
          beforeMount={initializeMonaco}
          options={editorOptions}
          loading={
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-gray-400">Loading VS Code-level editor...</p>
                <p className="text-xs text-gray-500 mt-2">IntelliSense • Search & Replace • Multi-cursor</p>
              </div>
            </div>
          }
        />
        
        {/* Status indicators */}
        <div className="absolute bottom-4 right-4 flex space-x-2">
          {updateFileMutation.isPending && (
            <div className="bg-slate-800 px-3 py-1 rounded text-xs text-gray-300 flex items-center">
              <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mr-2"></div>
              Saving...
            </div>
          )}
          {hasUnsavedChanges && !updateFileMutation.isPending && (
            <div className="bg-yellow-600 px-3 py-1 rounded text-xs text-white">
              Unsaved changes
            </div>
          )}
        </div>
      </div>

      {/* Keyboard shortcuts help */}
      <div className="bg-slate-800 border-t border-slate-700 px-4 py-1 text-xs text-gray-500 shrink-0">
        <span>Shortcuts: </span>
        <span className="text-gray-400">Ctrl+S (Save) • Ctrl+F (Find) • Ctrl+H (Replace) • F12 (Go to Definition) • Alt+Click (Multi-cursor)</span>
      </div>
    </div>
  );
}