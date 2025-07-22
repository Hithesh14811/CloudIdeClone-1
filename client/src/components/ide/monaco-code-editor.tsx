import { useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { useToast } from '@/hooks/use-toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

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
      return 'css';
    case 'json':
      return 'json';
    case 'md':
      return 'markdown';
    case 'xml':
      return 'xml';
    case 'sql':
      return 'sql';
    default:
      return 'plaintext';
  }
};

export default function MonacoCodeEditor({ file, projectId }: MonacoCodeEditorProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const saveTimeoutRef = useRef<NodeJS.Timeout>();

  // Update file content mutation
  const updateFileMutation = useMutation({
    mutationFn: async ({ fileId, content }: { fileId: number; content: string }) => {
      return apiRequest('PUT', `/api/projects/${projectId}/files/${fileId}`, { content });
    },
    onSuccess: () => {
      // Invalidate file list to update in tree
      queryClient.invalidateQueries({ queryKey: ['project-files', projectId] });
    },
    onError: (error: any) => {
      toast({
        title: 'Save Failed',
        description: error.message || 'Failed to save file',
        variant: 'destructive'
      });
    },
  });

  const handleEditorChange = (value: string | undefined) => {
    if (!file || !value) return;

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Debounced autosave - save after 1 second of no changes
    saveTimeoutRef.current = setTimeout(() => {
      updateFileMutation.mutate({
        fileId: file.id,
        content: value,
      });
    }, 1000);
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

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

  return (
    <div className="flex-1 bg-slate-900 relative">
      <div className="absolute inset-0">
        <Editor
          height="100%"
          defaultLanguage={getLanguageFromFilename(file.name)}
          language={getLanguageFromFilename(file.name)}
          path={file.path}
          value={file.content || ''}
          onChange={handleEditorChange}
          theme="vs-dark"
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            lineNumbers: 'on',
            roundedSelection: false,
            scrollBeyondLastLine: false,
            readOnly: false,
            automaticLayout: true,
            tabSize: 2,
            insertSpaces: true,
            wordWrap: 'on',
            contextmenu: true,
            folding: true,
            renderWhitespace: 'selection',
            renderControlCharacters: false,
            cursorBlinking: 'blink',
            cursorStyle: 'line',
            selectionHighlight: true,
            lineHeight: 1.5,
            letterSpacing: 0.5,
          }}
          loading={
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-gray-400">Loading editor...</p>
              </div>
            </div>
          }
        />
      </div>
      
      {/* Save indicator */}
      {updateFileMutation.isPending && (
        <div className="absolute top-4 right-4 bg-slate-800 px-3 py-1 rounded text-xs text-gray-300">
          Saving...
        </div>
      )}
    </div>
  );
}