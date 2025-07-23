import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import TopNavBar from "@/components/ide/top-nav-bar";
import FileTree from "@/components/ide/file-tree";
import Tabs from "@/components/ide/tabs";
import MonacoCodeEditor from "@/components/ide/monaco-code-editor";
import RightPanel from "@/components/ide/right-panel";
import XTerminal from "@/components/ide/XTerminal";
import GlobalSearch from "@/components/ide/global-search";
import AIAssistant from "@/components/ide/ai-assistant";
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useSocket } from "@/hooks/useSocket";

interface FileNode {
  id: number;
  name: string;
  type: 'file' | 'folder';
  path: string;
  content?: string;
  parentId?: number;
}

interface IDEProps {
  projectId: string;
}

export default function IDE({ projectId }: IDEProps) {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const socket = useSocket();
  const [openTabs, setOpenTabs] = useState<FileNode[]>([]);
  const [activeFile, setActiveFile] = useState<FileNode | undefined>();
  const [fileTreeUpdateCallback, setFileTreeUpdateCallback] = useState<((data: any) => void) | null>(null);
  const [showGlobalSearch, setShowGlobalSearch] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(300);
  const [isResizing, setIsResizing] = useState(false);
  const [rightPanelTab, setRightPanelTab] = useState<'preview' | 'ai'>('preview');

  // Fetch project details
  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/projects/${projectId}`);
      return response as { id: number; name: string; description: string; userId: string; };
    },
    enabled: !!projectId,
  });

  // Fetch all files for search functionality
  const { data: allFiles = [] } = useQuery({
    queryKey: ['project-files', projectId],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/projects/${projectId}/files`);
      return response as FileNode[];
    },
    enabled: !!projectId,
  });
  
  // Update document title with project name
  useEffect(() => {
    if (project?.name) {
      document.title = `${project.name} - Shetty IDE`;
    } else {
      document.title = "Shetty IDE";
    }
  }, [project]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Global search shortcut
      if (e.ctrlKey && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        setShowGlobalSearch(true);
      }
      
      // Close search with Escape
      if (e.key === 'Escape' && showGlobalSearch) {
        e.preventDefault();
        setShowGlobalSearch(false);
      }

      // Quick file open (Ctrl+P)
      if (e.ctrlKey && e.key === 'p') {
        e.preventDefault();
        toast({
          title: "Quick Open",
          description: "Quick file picker coming soon! Use Ctrl+Shift+F for global search.",
        });
      }

      // Command palette (Ctrl+Shift+P)
      if (e.ctrlKey && e.shiftKey && e.key === 'P') {
        e.preventDefault();
        toast({
          title: "Command Palette",
          description: "Command palette coming soon!",
        });
      }

      // Toggle terminal (Ctrl+`)
      if (e.ctrlKey && e.key === '`') {
        e.preventDefault();
        // Terminal toggle functionality would go here
      }

      // Toggle AI Assistant (Ctrl+Shift+A)
      if (e.ctrlKey && e.shiftKey && e.key === 'A') {
        e.preventDefault();
        setRightPanelTab(rightPanelTab === 'ai' ? 'preview' : 'ai');
      }

      // Save all files (Ctrl+K, S)
      if (e.ctrlKey && e.key === 'k') {
        e.preventDefault();
        // Save all files functionality
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showGlobalSearch, toast, rightPanelTab]);

  // Redirect to home if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 500);
      return;
    }
  }, [isAuthenticated, isLoading, toast]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400">Loading Shetty IDE...</p>
          <p className="text-xs text-gray-500 mt-2">VS Code-level experience loading...</p>
        </div>
      </div>
    );
  }

  const handleFileSelect = (file: FileNode) => {
    if (file.type === 'folder') return;
    
    // Add to tabs if not already open
    const isAlreadyOpen = openTabs.some(tab => tab.id === file.id);
    if (!isAlreadyOpen) {
      setOpenTabs(prev => [...prev, file]);
    }
    
    setActiveFile(file);
  };

  const handleGlobalSearchFileSelect = (fileId: number, line?: number) => {
    const file = allFiles.find(f => f.id === fileId);
    if (file) {
      handleFileSelect(file);
      // TODO: Navigate to specific line if provided
      if (line) {
        // This would require Monaco editor integration
        console.log(`Navigate to line ${line} in file ${file.name}`);
      }
    }
  };

  const handleTabClose = (file: FileNode) => {
    setOpenTabs(prev => prev.filter(tab => tab.id !== file.id));
    
    // If closing active tab, switch to another tab or close editor
    if (activeFile?.id === file.id) {
      const remainingTabs = openTabs.filter(tab => tab.id !== file.id);
      setActiveFile(remainingTabs[0] || undefined);
    }
  };

  const handleTabSelect = (file: FileNode) => {
    setActiveFile(file);
  };

  const handleFileTreeUpdate = useCallback((callback: (data: any) => void) => {
    setFileTreeUpdateCallback(callback);
  }, []);

  const handleTerminalFileTreeUpdate = useCallback((callback: (data: any) => void) => {
    if (fileTreeUpdateCallback) {
      fileTreeUpdateCallback(callback);
    }
  }, [fileTreeUpdateCallback]);

  // AI Assistant Integration
  const handleAIFileSelect = useCallback((fileId: number) => {
    const file = allFiles.find(f => f.id === fileId);
    if (file) {
      handleFileSelect(file);
    }
  }, [allFiles]);

  const handleAIRunCommand = useCallback((command: string) => {
    // Send command to terminal
    if (socket) {
      // Find active terminal session and send command
      socket.emit('terminal:input', { 
        sessionId: 'current', // This would need to be tracked
        input: command + '\n' 
      });
    }
  }, [socket]);

  // Sidebar resize handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsResizing(true);
    e.preventDefault();
  }, []);

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return;
    
    const newWidth = e.clientX;
    if (newWidth >= 200 && newWidth <= 600) {
      setSidebarWidth(newWidth);
    }
  }, [isResizing]);

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isResizing, handleMouseMove, handleMouseUp]);

  return (
    <div className="h-screen flex flex-col bg-slate-900 text-gray-200 font-sans overflow-hidden">
      <TopNavBar projectName={project?.name} projectId={projectId} />
      
      <div className="flex-1 flex overflow-hidden relative">
        {/* Global Search Overlay */}
        <GlobalSearch
          projectId={parseInt(projectId)}
          onFileSelect={handleGlobalSearchFileSelect}
          isOpen={showGlobalSearch}
          onClose={() => setShowGlobalSearch(false)}
        />

        {/* Left Sidebar */}
        <div className="flex">
          <div 
            className="bg-slate-800 border-r border-slate-700 flex flex-col"
            style={{ width: `${sidebarWidth}px` }}
          >
            <FileTree 
              projectId={parseInt(projectId)} 
              onFileSelect={handleFileSelect}
              selectedFile={activeFile}
              onFileTreeUpdateReceiver={handleFileTreeUpdate}
            />
          </div>
          
          {/* Resize Handle */}
          <div
            className="w-1 bg-slate-700 hover:bg-slate-600 cursor-col-resize transition-colors"
            onMouseDown={handleMouseDown}
          />
        </div>
        
        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0">
          <Tabs 
            openTabs={openTabs}
            activeTab={activeFile}
            onTabSelect={handleTabSelect}
            onTabClose={handleTabClose}
          />
          
          <div className="flex-1 flex min-h-0">
            <div className="flex-1 flex flex-col min-w-0">
              <MonacoCodeEditor 
                file={activeFile}
                projectId={parseInt(projectId)}
              />
              <XTerminal 
                projectId={projectId} 
                onFileTreeUpdate={handleTerminalFileTreeUpdate}
              />
            </div>
            
            {/* Enhanced Right Panel with AI */}
            <div className="w-80 border-l border-slate-700 bg-slate-800 flex flex-col">
              {/* Panel Tabs */}
              <div className="flex border-b border-slate-700">
                <button
                  className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                    rightPanelTab === 'preview' 
                      ? 'bg-slate-700 text-gray-200' 
                      : 'text-gray-400 hover:text-gray-200 hover:bg-slate-750'
                  }`}
                  onClick={() => setRightPanelTab('preview')}
                >
                  Preview
                </button>
                <button
                  className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                    rightPanelTab === 'ai' 
                      ? 'bg-slate-700 text-gray-200' 
                      : 'text-gray-400 hover:text-gray-200 hover:bg-slate-750'
                  }`}
                  onClick={() => setRightPanelTab('ai')}
                >
                  AI Assistant
                </button>
              </div>

              {/* Panel Content */}
              <div className="flex-1 overflow-hidden">
                {rightPanelTab === 'preview' ? (
                  <RightPanel projectId={projectId} />
                ) : (
                  <AIAssistant 
                    projectId={projectId}
                    onFileSelect={handleAIFileSelect}
                    onRunCommand={handleAIRunCommand}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Enhanced Status Bar */}
      <div className="bg-slate-800 border-t border-slate-700 px-4 py-1 text-xs text-gray-500 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <span>
              {activeFile ? `${activeFile.name} • Line 1, Column 1` : 'No file selected'}
            </span>
            <span>
              {openTabs.length} file{openTabs.length !== 1 ? 's' : ''} open
            </span>
            <span>
              {allFiles.length} total files
            </span>
          </div>
          <div className="flex items-center space-x-4">
            <span>
              Shortcuts: Ctrl+Shift+F (Search) • Ctrl+Shift+A (AI) • Ctrl+P (Quick Open) • Ctrl+` (Terminal)
            </span>
            <span className="text-blue-400">
              🤖 AI Assistant Ready
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
