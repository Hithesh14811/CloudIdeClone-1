import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import TopNavBar from "@/components/ide/top-nav-bar";
import FileExplorer from "@/components/ide/file-explorer";
import TabBar from "@/components/ide/tab-bar";
import MonacoEditor from "@/components/ide/monaco-editor";
import RightPanel from "@/components/ide/right-panel";
import Terminal from "@/components/ide/terminal";

import { useIDE } from "@/hooks/useIDE";

interface IDEProps {
  projectId: string;
}

export default function IDE({ projectId }: IDEProps) {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const { currentProject } = useIDE(projectId);
  
  // Update document title with project name
  useEffect(() => {
    if (currentProject?.name) {
      document.title = `${currentProject.name} - Shetty IDE`;
    } else {
      document.title = "Shetty IDE";
    }
  }, [currentProject]);

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

  return (
    <div className="h-screen flex flex-col bg-slate-900 text-gray-200 font-sans overflow-hidden">
      <TopNavBar projectName={currentProject?.name} />
      
      <div className="flex-1 flex overflow-hidden">
        <FileExplorer projectId={projectId} />
        
        <div className="flex-1 flex flex-col">
          <TabBar />
          
          <div className="flex-1 flex">
            <MonacoEditor />
            <RightPanel />
          </div>
        </div>
      </div>
      
      <Terminal />
    </div>
  );
}
