import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import TopNavBar from "@/components/ide/top-nav-bar";
import FileTree from "@/components/ide/file-tree";
import Tabs from "@/components/ide/tabs";
import MonacoCodeEditor from "@/components/ide/monaco-code-editor";
import RightPanel from "@/components/ide/right-panel";
import Terminal from "@/components/ide/terminal";
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

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
  const [openTabs, setOpenTabs] = useState<FileNode[]>([]);
  const [activeFile, setActiveFile] = useState<FileNode | undefined>();

  // Fetch project details
  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/projects/${projectId}`);
      return response as { id: number; name: string; description: string; userId: string; };
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

  return (
    <div className="h-screen flex flex-col bg-slate-900 text-gray-200 font-sans overflow-hidden">
      <TopNavBar projectName={project?.name} projectId={projectId} />
      
      <div className="flex-1 flex overflow-hidden">
        <FileTree 
          projectId={parseInt(projectId)} 
          onFileSelect={handleFileSelect}
          selectedFile={activeFile}
        />
        
        <div className="flex-1 flex flex-col">
          <Tabs 
            openTabs={openTabs}
            activeTab={activeFile}
            onTabSelect={handleTabSelect}
            onTabClose={handleTabClose}
          />
          
          <div className="flex-1 flex">
            <div className="flex-1 flex flex-col">
              <MonacoCodeEditor 
                file={activeFile}
                projectId={parseInt(projectId)}
              />
              <Terminal projectId={projectId} />
            </div>
            
            <RightPanel projectId={projectId} />
          </div>
        </div>
      </div>
    </div>
  );
}
