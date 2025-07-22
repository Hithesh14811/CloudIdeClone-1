import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useIDE } from "@/hooks/useIDE";
import { apiRequest } from "@/lib/queryClient";
import { File, Folder, FolderOpen, FileText, FileCode, FilePlus, FolderPlus, RefreshCw, MoreVertical, Upload, Download, ChevronRight, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { File as FileType } from "@shared/schema";

export default function FileExplorer() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currentProject, openFile, currentFile } = useIDE();
  const [expandedFolders, setExpandedFolders] = useState<Set<number>>(new Set());
  const [creatingItem, setCreatingItem] = useState<{ type: 'file' | 'folder'; parentId?: number } | null>(null);
  const [newItemName, setNewItemName] = useState("");
  
  const { data: files, isLoading } = useQuery<FileType[]>({
    queryKey: ["/api/projects", currentProject?.id, "files"],
    enabled: !!currentProject,
  });

  const createFileMutation = useMutation({
    mutationFn: async (fileData: { name: string; isFolder: boolean; parentId?: number }) => {
      if (!currentProject) throw new Error("No project selected");
      
      const parentPath = fileData.parentId ? 
        files?.find(f => f.id === fileData.parentId)?.path || "" : "";
      const fullPath = parentPath ? `${parentPath}/${fileData.name}` : `/${fileData.name}`;
      
      return await apiRequest("POST", `/api/projects/${currentProject.id}/files`, {
        ...fileData,
        path: fullPath,
        content: fileData.isFolder ? undefined : "",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", currentProject?.id, "files"] });
      toast({ 
        title: "Success", 
        description: `${creatingItem?.type === 'folder' ? 'Folder' : 'File'} created successfully` 
      });
      setCreatingItem(null);
      setNewItemName("");
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleCreateItem = (type: 'file' | 'folder', parentId?: number) => {
    setCreatingItem({ type, parentId });
    setNewItemName("");
    // Expand parent folder if creating inside one
    if (parentId) {
      setExpandedFolders(prev => new Set(Array.from(prev).concat(parentId)));
    }
  };

  const handleSubmitNewItem = () => {
    if (!newItemName.trim()) {
      toast({
        title: "Error",
        description: "Please enter a name",
        variant: "destructive",
      });
      return;
    }

    createFileMutation.mutate({
      name: newItemName.trim(),
      isFolder: creatingItem?.type === 'folder',
      parentId: creatingItem?.parentId,
    });
  };

  const handleCancelCreate = () => {
    setCreatingItem(null);
    setNewItemName("");
  };

  const handleUploadFile = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.onchange = (e) => {
      const target = e.target as HTMLInputElement;
      const files = target.files;
      if (files) {
        Array.from(files).forEach(file => {
          const reader = new FileReader();
          reader.onload = (event) => {
            const content = event.target?.result as string;
            createFileMutation.mutate({
              name: file.name,
              isFolder: false,
              parentId: undefined,
            });
          };
          reader.readAsText(file);
        });
      }
    };
    input.click();
  };

  const handleDownloadAsZip = () => {
    toast({
      title: "Download",
      description: "Download as ZIP functionality coming soon!",
    });
  };

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

    const items: JSX.Element[] = [];

    // Add existing files
    filteredFiles.forEach((file) => {
      const isExpanded = expandedFolders.has(file.id);
      const hasChildren = files.some(f => f.parentId === file.id);
      
      items.push(
        <div key={file.id}>
          <div
            className={`group flex items-center px-2 py-1 rounded text-sm cursor-pointer transition-colors ${
              currentFile?.id === file.id
                ? "bg-slate-600 border-l-2 border-blue-500"
                : "hover:bg-slate-700"
            }`}
            style={{ paddingLeft: `${8 + depth * 16}px` }}
            onClick={() => handleFileClick(file)}
          >
            <div className="flex items-center flex-1 min-w-0">
              {file.isFolder ? (
                <>
                  {hasChildren ? (
                    isExpanded ? (
                      <ChevronDown className="w-3 h-3 text-gray-400 mr-1 flex-shrink-0" />
                    ) : (
                      <ChevronRight className="w-3 h-3 text-gray-400 mr-1 flex-shrink-0" />
                    )
                  ) : (
                    <div className="w-3 mr-1" />
                  )}
                  {isExpanded ? (
                    <FolderOpen className="w-4 h-4 text-yellow-500 mr-2 flex-shrink-0" />
                  ) : (
                    <Folder className="w-4 h-4 text-yellow-500 mr-2 flex-shrink-0" />
                  )}
                </>
              ) : (
                <>
                  <div className="w-3 mr-1" />
                  {getFileIcon(file)}
                </>
              )}
              <span className="ml-1 truncate">{file.name}</span>
            </div>
            
            {/* Context menu for individual files/folders */}
            {file.isFolder && (
              <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0 text-gray-400 hover:text-gray-200"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreVertical className="w-3 h-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="bg-slate-800 border-slate-600 text-gray-200">
                    <DropdownMenuItem onClick={() => handleCreateItem('file', file.id)}>
                      <FilePlus className="w-4 h-4 mr-2" />
                      New File
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleCreateItem('folder', file.id)}>
                      <FolderPlus className="w-4 h-4 mr-2" />
                      New Folder
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>
          
          {file.isFolder && isExpanded && (
            <div>
              {createNestedFileList(files, file.id, depth + 1)}
            </div>
          )}
        </div>
      );
    });

    // Add inline creation input if creating at this level
    if (creatingItem && creatingItem.parentId === parentId) {
      items.push(
        <div key="creating-item" style={{ paddingLeft: `${8 + depth * 16}px` }}>
          <div className="flex items-center px-2 py-1 text-sm">
            <div className="w-3 mr-1" />
            {creatingItem.type === 'folder' ? (
              <Folder className="w-4 h-4 text-yellow-500 mr-2 flex-shrink-0" />
            ) : (
              <FileText className="w-4 h-4 text-gray-400 mr-2 flex-shrink-0" />
            )}
            <Input
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSubmitNewItem();
                } else if (e.key === 'Escape') {
                  handleCancelCreate();
                }
              }}
              onBlur={handleSubmitNewItem}
              className="h-6 text-xs bg-slate-700 border-slate-600 text-gray-200 flex-1"
              placeholder={`Enter ${creatingItem.type} name...`}
              autoFocus
            />
          </div>
        </div>
      );
    }

    return items;
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
          <h3 className="text-sm font-medium text-gray-200">Files</h3>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-gray-400 hover:text-gray-200 hover:bg-slate-700"
                title="File Actions"
              >
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="bg-slate-800 border-slate-600 text-gray-200">
              <DropdownMenuItem onClick={() => handleCreateItem('file')}>
                <FilePlus className="w-4 h-4 mr-2" />
                New File
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleCreateItem('folder')}>
                <FolderPlus className="w-4 h-4 mr-2" />
                New Folder
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleUploadFile}>
                <Upload className="w-4 h-4 mr-2" />
                Upload File
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => toast({ title: "Upload Folder", description: "Feature coming soon!" })}>
                <Upload className="w-4 h-4 mr-2" />
                Upload Folder
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDownloadAsZip}>
                <Download className="w-4 h-4 mr-2" />
                Download as ZIP
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/projects", currentProject.id, "files"] })}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
            {/* Root level creation input */}
            {creatingItem && !creatingItem.parentId && (
              <div className="px-2 py-1">
                <div className="flex items-center text-sm">
                  {creatingItem.type === 'folder' ? (
                    <Folder className="w-4 h-4 text-yellow-500 mr-2 flex-shrink-0" />
                  ) : (
                    <FileText className="w-4 h-4 text-gray-400 mr-2 flex-shrink-0" />
                  )}
                  <Input
                    value={newItemName}
                    onChange={(e) => setNewItemName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleSubmitNewItem();
                      } else if (e.key === 'Escape') {
                        handleCancelCreate();
                      }
                    }}
                    onBlur={handleSubmitNewItem}
                    className="h-6 text-xs bg-slate-700 border-slate-600 text-gray-200 flex-1"
                    placeholder={`Enter ${creatingItem.type} name...`}
                    autoFocus
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
