import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useIDE } from "@/hooks/useIDE";
import { apiRequest } from "@/lib/queryClient";
import { File, Folder, FolderOpen, FileText, FileCode, FilePlus, FolderPlus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { File as FileType } from "@shared/schema";

export default function FileExplorer() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currentProject, openFile, currentFile, setShowCreateModal } = useIDE();
  const [expandedFolders, setExpandedFolders] = useState<Set<number>>(new Set());
  
  const { data: files, isLoading } = useQuery<FileType[]>({
    queryKey: ["/api/projects", currentProject?.id, "files"],
    enabled: !!currentProject,
  });

  const createFileMutation = useMutation({
    mutationFn: async (fileData: { name: string; isFolder: boolean; parentId?: number }) => {
      if (!currentProject) throw new Error("No project selected");
      return await apiRequest("POST", `/api/projects/${currentProject.id}/files`, {
        ...fileData,
        path: `/${fileData.name}`,
        content: fileData.isFolder ? undefined : "",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", currentProject?.id, "files"] });
      toast({ title: "Success", description: "File created successfully" });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const getFileIcon = (file: FileType) => {
    if (file.isFolder) {
      return <Folder className="w-4 h-4 text-yellow-500" />;
    }
    
    const extension = file.name.split('.').pop()?.toLowerCase();
    switch (extension) {
      case 'js':
      case 'jsx':
      case 'ts':
      case 'tsx':
        return <FileCode className="w-4 h-4 text-yellow-400" />;
      case 'html':
      case 'htm':
        return <FileCode className="w-4 h-4 text-orange-400" />;
      case 'css':
      case 'scss':
      case 'sass':
        return <FileCode className="w-4 h-4 text-blue-400" />;
      case 'json':
        return <FileCode className="w-4 h-4 text-green-400" />;
      case 'md':
      case 'markdown':
        return <FileText className="w-4 h-4 text-gray-400" />;
      default:
        return <FileText className="w-4 h-4 text-gray-400" />;
    }
  };

  const handleFileClick = (file: FileType) => {
    if (file.isFolder) {
      setExpandedFolders(prev => {
        const newSet = new Set(prev);
        if (newSet.has(file.id)) {
          newSet.delete(file.id);
        } else {
          newSet.add(file.id);
        }
        return newSet;
      });
    } else {
      openFile(file);
    }
  };

  const createNestedFileList = (files: FileType[], parentId: number | null = null, depth: number = 0): JSX.Element[] => {
    const filteredFiles = files.filter(file => {
      if (parentId === null) {
        return !file.parentId || file.parentId === 0;
      }
      return file.parentId === parentId;
    });

    return filteredFiles.map((file) => {
      const isExpanded = expandedFolders.has(file.id);
      const hasChildren = files.some(f => f.parentId === file.id);
      
      return (
        <div key={file.id}>
          <div
            className={`flex items-center px-2 py-1 rounded text-sm cursor-pointer transition-colors ${
              currentFile?.id === file.id
                ? "bg-slate-600 border-l-2 border-blue-500"
                : "hover:bg-slate-700"
            }`}
            style={{ paddingLeft: `${8 + depth * 16}px` }}
            onClick={() => handleFileClick(file)}
          >
            {file.isFolder ? (
              <>
                {isExpanded ? (
                  <FolderOpen className="w-4 h-4 text-yellow-500 mr-2" />
                ) : (
                  <Folder className="w-4 h-4 text-yellow-500 mr-2" />
                )}
              </>
            ) : (
              getFileIcon(file)
            )}
            <span className="ml-1 truncate">{file.name}</span>
          </div>
          
          {file.isFolder && isExpanded && hasChildren && (
            <div>
              {createNestedFileList(files, file.id, depth + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  if (!currentProject) {
    return (
      <div className="w-64 bg-slate-800 border-r border-slate-700 flex items-center justify-center">
        <p className="text-gray-400 text-sm">No project selected</p>
      </div>
    );
  }

  return (
    <div className="w-64 bg-slate-800 border-r border-slate-700 flex flex-col">
      <div className="p-3 border-b border-slate-700">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-gray-200">EXPLORER</h3>
          <div className="flex space-x-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-gray-400 hover:text-gray-200 hover:bg-slate-700"
              onClick={() => setShowCreateModal({ show: true, type: "file" })}
              title="New File"
            >
              <FilePlus className="w-3 h-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-gray-400 hover:text-gray-200 hover:bg-slate-700"
              onClick={() => setShowCreateModal({ show: true, type: "folder" })}
              title="New Folder"
            >
              <FolderPlus className="w-3 h-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-gray-400 hover:text-gray-200 hover:bg-slate-700"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/projects", currentProject.id, "files"] })}
              title="Refresh"
            >
              <RefreshCw className="w-3 h-3" />
            </Button>
          </div>
        </div>
        <div className="text-xs font-medium text-gray-400 uppercase tracking-wider">
          {currentProject.name}
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-slate-800">
        {isLoading ? (
          <div className="p-4 text-center">
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          </div>
        ) : (
          <div className="p-2">
            <div className="space-y-0.5">
              {createNestedFileList(files || [])}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
