import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { 
  ChevronRight, 
  ChevronDown, 
  File, 
  Folder, 
  FolderOpen, 
  MoreHorizontal,
  Plus,
  Upload,
  Download,
  RefreshCw,
  Trash2,
  Edit,
  Copy,
  Check,
  Square,
  CheckSquare
} from 'lucide-react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import FileUpload from './file-upload';
import { io, Socket } from 'socket.io-client';

interface FileNode {
  id: number;
  name: string;
  type: 'file' | 'folder';
  path: string;
  content?: string;
  parentId?: number;
  children?: FileNode[];
}

interface FileTreeProps {
  projectId: number;
  onFileSelect: (file: FileNode) => void;
  selectedFile?: FileNode;
  onFileTreeUpdateReceiver?: (callback: (data: any) => void) => void;
}

const getFileIcon = (filename: string) => {
  const ext = filename.split('.').pop()?.toLowerCase();
  const iconProps = { className: "w-4 h-4 mr-2 flex-shrink-0" };
  
  switch (ext) {
    case 'js':
    case 'jsx':
      return <File {...iconProps} style={{ color: '#f7df1e' }} />;
    case 'ts':
    case 'tsx':
      return <File {...iconProps} style={{ color: '#3178c6' }} />;
    case 'py':
      return <File {...iconProps} style={{ color: '#3776ab' }} />;
    case 'html':
      return <File {...iconProps} style={{ color: '#e34f26' }} />;
    case 'css':
      return <File {...iconProps} style={{ color: '#1572b6' }} />;
    case 'json':
      return <File {...iconProps} style={{ color: '#000000' }} />;
    case 'md':
      return <File {...iconProps} style={{ color: '#ffffff' }} />;
    default:
      return <File {...iconProps} style={{ color: '#6b7280' }} />;
  }
};

export default function FileTree({ projectId, onFileSelect, selectedFile, onFileTreeUpdateReceiver }: FileTreeProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  // Use ref to persist expanded folders state across refreshes
  const expandedFolderPathsRef = useRef<Set<string>>(new Set(['/app'])); // Root always expanded by path
  const [expandedFolderPaths, setExpandedFolderPaths] = useState<Set<string>>(new Set(['/app'])); // Local state for re-renders
  const [creatingItem, setCreatingItem] = useState<{
    type: 'file' | 'folder';
    parentId?: number;
    show: boolean;
  }>({ type: 'file', show: false });
  const [newItemName, setNewItemName] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<Set<number>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [isUserCreating, setIsUserCreating] = useState(false);
  const [showLoadingIndicator, setShowLoadingIndicator] = useState(true); // Control loading indicator visibility
  const socketRef = useRef<Socket | null>(null);
  const autoRefreshRef = useRef<NodeJS.Timeout | null>(null);
  
  // Function to update both ref and state for expanded folders
  const updateExpandedFolders = (updater: (prev: Set<string>) => Set<string>) => {
    const newExpandedPaths = updater(expandedFolderPathsRef.current);
    expandedFolderPathsRef.current = newExpandedPaths;
    setExpandedFolderPaths(new Set(newExpandedPaths)); // Create new Set to trigger re-render
  };

  // Fetch files for the project 
  const { data: files = [], isLoading, refetch } = useQuery<FileNode[]>({
    queryKey: ['project-files', projectId],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/projects/${projectId}/files`);
      // Map database fields to FileNode interface
      return response.map((file: any) => ({
        id: file.id,
        name: file.name,
        type: file.isFolder ? 'folder' : 'file',
        path: file.path,
        content: file.content,
        parentId: file.parentId,
        children: []
      }));
    },
    enabled: !!projectId,
    staleTime: Infinity, // Data is always fresh since we update via socket
    gcTime: 5 * 60 * 1000, // Keep data in cache for 5 minutes for better UX
    refetchOnWindowFocus: false, // Disable refetching on window focus
    refetchOnReconnect: false, // Disable refetching on reconnect
  });

  // Hide loading indicator after first load or when files exist
  useEffect(() => {
    if (files.length > 0 || (!isLoading && files.length === 0)) {
      setShowLoadingIndicator(false);
    }
  }, [files, isLoading]);
  
  // Restore expanded state after data refresh
  useEffect(() => {
    if (files.length > 0) {
      // Ensure the state is synced with the ref after data refresh
      setExpandedFolderPaths(new Set(expandedFolderPathsRef.current));
    }
  }, [files]);

  // File tree update receiver disabled - using direct socket updates instead

  // Set up socket connection for manual refresh and real-time updates
  useEffect(() => {
    if (!socketRef.current) {
      socketRef.current = io();
    }

    // Listen for file changes from terminal with new file data format
    const handleFileChanges = (data: any) => {
      console.log('Files changed via socket:', data);
      
      // Handle new realtime watcher format with tree structure
      if (data.projectId == projectId && data.tree) {
        console.log('Updating file tree with new tree format');
        // Keep loading indicator hidden for socket updates too
        setShowLoadingIndicator(false);
        
        // Convert tree format to flat file list for compatibility
        const flatFiles = convertTreeToFlatFiles(data.tree);
        
        // Update React Query cache directly with socket data to avoid API call
        queryClient.setQueryData(['project-files', projectId], flatFiles);
        
        // Keep expanded folders state - no reset needed
      }
      // Handle legacy format with files array (for backward compatibility)
      else if (data.projectId == projectId && data.files) {
        console.log('Updating file tree with socket data:', data.files.length, 'files');
        // Keep loading indicator hidden for socket updates too
        setShowLoadingIndicator(false);
        
        // Update React Query cache directly with socket data to avoid API call
        queryClient.setQueryData(['project-files', projectId], data.files);
        
        // Keep expanded folders state - no reset needed
      }
    };

    // Helper function to convert tree structure to flat file list
    const convertTreeToFlatFiles = (tree: any): FileNode[] => {
      const flatFiles: FileNode[] = [];
      let currentId = Date.now(); // Generate temporary IDs for new files
      
      const processNode = (node: any, parentPath: string = '') => {
        const fullPath = parentPath + node.path;
        
        // Add current node to flat list
        flatFiles.push({
          id: currentId++,
          name: node.name,
          type: node.type,
          path: fullPath,
          content: '',
          children: []
        });
        
        // Process children recursively
        if (node.children && node.children.length > 0) {
          node.children.forEach((child: any) => {
            processNode(child, fullPath);
          });
        }
      };
      
      if (tree) {
        processNode(tree);
      }
      
      return flatFiles;
    };

    socketRef.current.on('files:changed', handleFileChanges);
    socketRef.current.on('file-tree-update', handleFileChanges);

    return () => {
      if (socketRef.current) {
        socketRef.current.off('files:changed', handleFileChanges);
        socketRef.current.off('file-tree-update', handleFileChanges);
        socketRef.current.disconnect();
      }
    };
  }, [projectId, queryClient]);

  // Auto-refresh disabled - using real-time socket updates instead
  // This comment remains as placeholder to show we've removed the polling interval

  // Manual refresh function
  const handleManualRefresh = () => {
    setIsRefreshing(true);
    // Keep loading indicator hidden for manual refresh too
    setShowLoadingIndicator(false);
    
    // Try socket refresh first
    if (socketRef.current) {
      socketRef.current.emit('file-tree:refresh', { projectId: projectId.toString() });
    }
    
    // Also invalidate query cache as fallback
    queryClient.invalidateQueries({ queryKey: ['project-files', projectId] });
    
    // Show visual feedback
    setTimeout(() => {
      setIsRefreshing(false);
      toast({ 
        title: 'File tree refreshed', 
        description: 'File list has been updated with latest changes'
      });
    }, 500);
  };

  // Create file/folder mutation
  const createMutation = useMutation({
    mutationFn: async (data: { name: string; type: 'file' | 'folder'; parentId?: number }) => {
      const parentPath = data.parentId 
        ? files.find((f: FileNode) => f.id === data.parentId)?.path || ''
        : '';
      const fullPath = parentPath ? `${parentPath}/${data.name}` : `/${data.name}`;
      
      const response = await apiRequest('POST', `/api/projects/${projectId}/files`, {
        name: data.name,
        path: fullPath,
        isFolder: data.type === 'folder',
        parentId: data.parentId || null,
        content: data.type === 'file' ? '' : undefined,
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-files', projectId] });
      setCreatingItem({ type: 'file', show: false });
      setNewItemName('');
      setIsUserCreating(false); // Stop blocking auto-refresh
      toast({ title: 'Success', description: 'Item created successfully' });
    },
    onError: (error: any) => {
      setIsUserCreating(false); // Stop blocking auto-refresh even on error
      toast({ 
        title: 'Error', 
        description: error.message || 'Failed to create item',
        variant: 'destructive' 
      });
    },
  });

  // Delete file/folder mutation (for single item)
  const deleteMutation = useMutation({
    mutationFn: async (fileId: number) => {
      const response = await apiRequest('DELETE', `/api/files/${fileId}`);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-files', projectId] });
      toast({
        title: 'Success',
        description: 'Item deleted successfully'
      });
    },
    onError: (error: any) => {
      console.error('Error deleting item:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete item',
        variant: 'destructive'
      });
    },
  });

  // Bulk delete mutation (for multiple items)
  const bulkDeleteMutation = useMutation({
    mutationFn: async (fileIds: number[]) => {
      // Delete all files in parallel
      const deletePromises = fileIds.map(fileId => 
        apiRequest('DELETE', `/api/files/${fileId}`)
      );
      await Promise.all(deletePromises);
      return fileIds;
    },
    onMutate: async (fileIds: number[]) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['project-files', projectId] });
      
      // Snapshot the previous value
      const previousFiles = queryClient.getQueryData(['project-files', projectId]) as FileNode[];
      
      // Optimistically update to remove deleted files
      queryClient.setQueryData(['project-files', projectId], (old: FileNode[] = []) => {
        return old.filter(file => !fileIds.includes(file.id));
      });
      
      return { previousFiles };
    },
    onError: (error: any, fileIds: number[], context) => {
      // Revert the optimistic update on error
      if (context?.previousFiles) {
        queryClient.setQueryData(['project-files', projectId], context.previousFiles);
      }
      console.error('Error deleting items:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete some items',
        variant: 'destructive'
      });
    },
    onSuccess: (deletedIds: number[]) => {
      // Invalidate and refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: ['project-files', projectId] });
      
      // Show success message with count
      toast({
        title: 'Success',
        description: `${deletedIds.length} item${deletedIds.length === 1 ? '' : 's'} deleted successfully`
      });
    },
  });

  const handleDeleteItem = (node: FileNode) => {
    if (window.confirm(`Are you sure you want to delete "${node.name}"?`)) {
      deleteMutation.mutate(node.id);
    }
  };

  const handleSelectFile = (fileId: number) => {
    setSelectedFiles(prev => {
      const newSet = new Set(prev);
      if (newSet.has(fileId)) {
        newSet.delete(fileId);
      } else {
        newSet.add(fileId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    const allFileIds = files.map((f: FileNode) => f.id);
    setSelectedFiles(new Set(allFileIds));
  };

  const handleDeselectAll = () => {
    setSelectedFiles(new Set());
  };

  const handleDeleteSelected = () => {
    const selectedCount = selectedFiles.size;
    if (selectedCount === 0) return;
    
    if (window.confirm(`Are you sure you want to delete ${selectedCount} selected item${selectedCount === 1 ? '' : 's'}?`)) {
      const selectedArray = Array.from(selectedFiles);
      bulkDeleteMutation.mutate(selectedArray);
      setSelectedFiles(new Set());
    }
  };

  const toggleSelectMode = () => {
    setSelectMode(!selectMode);
    if (selectMode) {
      // Exiting select mode, clear selections
      setSelectedFiles(new Set());
    }
  };

  // Build tree structure from flat file list
  const buildTree = (files: FileNode[]): FileNode[] => {
    const tree: FileNode[] = [];
    const map = new Map<number, FileNode>();

    // First pass: create map of all nodes
    files.forEach(file => {
      map.set(file.id, { ...file, children: [] });
    });

    // Second pass: build tree structure
    files.forEach(file => {
      const node = map.get(file.id)!;
      if (file.parentId && map.has(file.parentId)) {
        const parent = map.get(file.parentId)!;
        parent.children!.push(node);
      } else {
        tree.push(node);
      }
    });

    // Sort: folders first, then files, both alphabetically
    const sortNodes = (nodes: FileNode[]): FileNode[] => {
      return nodes.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'folder' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
    };

    const sortRecursively = (nodes: FileNode[]): FileNode[] => {
      const sorted = sortNodes(nodes);
      sorted.forEach(node => {
        if (node.children) {
          node.children = sortRecursively(node.children);
        }
      });
      return sorted;
    };

    return sortRecursively(tree);
  };

  const handleToggleExpand = (nodePath: string) => {
    updateExpandedFolders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(nodePath)) {
        newSet.delete(nodePath);
      } else {
        newSet.add(nodePath);
      }
      return newSet;
    });
  };

  const handleCreateItem = (type: 'file' | 'folder', parentId?: number) => {
    setCreatingItem({ type, parentId, show: true });
    setNewItemName('');
    setIsUserCreating(true); // Block auto-refresh during file creation
    
    // Expand parent folder if needed
    if (parentId) {
      const parentFile = files.find((f: FileNode) => f.id === parentId);
      if (parentFile) {
        updateExpandedFolders(prev => new Set(Array.from(prev).concat(parentFile.path)));
      }
    }
  };

  const handleSubmitNewItem = () => {
    if (!newItemName.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a name',
        variant: 'destructive'
      });
      return;
    }

    createMutation.mutate({
      name: newItemName.trim(),
      type: creatingItem.type,
      parentId: creatingItem.parentId,
    });
  };

  const handleCancelCreate = () => {
    setCreatingItem({ type: 'file', show: false });
    setNewItemName('');
    setIsUserCreating(false); // Stop blocking auto-refresh when cancelled
  };

  const renderNode = (node: FileNode, depth: number = 0): React.ReactNode => {
    const isExpanded = expandedFolderPaths.has(node.path);
    const hasChildren = node.children && node.children.length > 0;
    const isSelected = selectedFile?.id === node.id;
    const isFileSelected = selectedFiles.has(node.id);

    return (
      <div key={node.id}>
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div
              className={`group flex items-center px-2 py-1 text-sm cursor-pointer hover:bg-slate-700 ${
                isSelected ? 'bg-slate-600 border-l-2 border-blue-500' : ''
              } ${isFileSelected ? 'bg-blue-900/30' : ''}`}
              style={{ paddingLeft: `${8 + depth * 16}px` }}
              onClick={() => {
                if (selectMode) {
                  handleSelectFile(node.id);
                } else {
                  if (node.type === 'folder') {
                    handleToggleExpand(node.path);
                  } else {
                    onFileSelect(node);
                  }
                }
              }}
            >
              {/* Selection checkbox in select mode */}
              {selectMode && (
                <div className="mr-2">
                  {isFileSelected ? (
                    <CheckSquare className="w-4 h-4 text-blue-400" />
                  ) : (
                    <Square className="w-4 h-4 text-gray-400" />
                  )}
                </div>
              )}
              <div className="flex items-center flex-1 min-w-0">
                {node.type === 'folder' ? (
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
                    {getFileIcon(node.name)}
                  </>
                )}
                <span className="truncate text-gray-200">{node.name}</span>
              </div>
              
              {/* 3-dot menu button */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-gray-400 hover:text-gray-200 hover:bg-slate-700 opacity-0 group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                    }}
                  >
                    <MoreHorizontal className="w-3 h-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="bg-slate-800 border-slate-600 text-gray-200">
                  {node.type === 'folder' && (
                    <>
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleCreateItem('file', node.id); }}>
                        <Plus className="w-4 h-4 mr-2" />
                        New File
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleCreateItem('folder', node.id); }}>
                        <Plus className="w-4 h-4 mr-2" />
                        New Folder
                      </DropdownMenuItem>
                    </>
                  )}
                  <DropdownMenuItem 
                    onClick={(e) => { 
                      e.stopPropagation(); 
                      handleSelectFile(node.id); 
                    }}
                  >
                    {isFileSelected ? (
                      <>
                        <Square className="w-4 h-4 mr-2" />
                        Deselect
                      </>
                    ) : (
                      <>
                        <CheckSquare className="w-4 h-4 mr-2" />
                        Select
                      </>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={(e) => { 
                      e.stopPropagation(); 
                      handleDeleteItem(node); 
                    }}
                    className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent className="bg-slate-800 border-slate-600 text-gray-200">
            {node.type === 'folder' && (
              <>
                <ContextMenuItem onClick={() => handleCreateItem('file', node.id)}>
                  <Plus className="w-4 h-4 mr-2" />
                  New File
                </ContextMenuItem>
                <ContextMenuItem onClick={() => handleCreateItem('folder', node.id)}>
                  <Plus className="w-4 h-4 mr-2" />
                  New Folder
                </ContextMenuItem>
              </>
            )}
            <ContextMenuItem onClick={() => handleSelectFile(node.id)}>
              {isFileSelected ? (
                <>
                  <Square className="w-4 h-4 mr-2" />
                  Deselect
                </>
              ) : (
                <>
                  <CheckSquare className="w-4 h-4 mr-2" />
                  Select
                </>
              )}
            </ContextMenuItem>
            <ContextMenuItem 
              onClick={() => handleDeleteItem(node)}
              className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>

        {/* Show children if expanded */}
        {node.type === 'folder' && isExpanded && node.children && (
          <div>
            {node.children.map(child => renderNode(child, depth + 1))}
            
            {/* Show create input if creating in this folder */}
            {creatingItem.show && creatingItem.parentId === node.id && (
              <div
                className="flex items-center px-2 py-1 text-sm"
                style={{ paddingLeft: `${8 + (depth + 1) * 16}px` }}
              >
                <div className="w-3 mr-1" />
                {creatingItem.type === 'folder' ? (
                  <Folder className="w-4 h-4 text-yellow-500 mr-2 flex-shrink-0" />
                ) : (
                  <File className="w-4 h-4 text-gray-400 mr-2 flex-shrink-0" />
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
            )}
          </div>
        )}
      </div>
    );
  };

  const treeData = buildTree(files as FileNode[]);

  return (
    <div className="w-64 bg-slate-800 border-r border-slate-700 flex flex-col">
      {/* Header */}
      <div className="p-3 border-b border-slate-700">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-200 uppercase tracking-wider">Files</h3>
          <div className="flex items-center space-x-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-gray-400 hover:text-gray-200 hover:bg-slate-700"
              onClick={handleManualRefresh}
              title="Refresh file tree"
              disabled={isRefreshing}
            >
              <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-gray-400 hover:text-gray-200 hover:bg-slate-700"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
            <DropdownMenuContent className="bg-slate-800 border-slate-600 text-gray-200">
              <DropdownMenuItem onClick={() => handleCreateItem('file')}>
                <Plus className="w-4 h-4 mr-2" />
                New File
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleCreateItem('folder')}>
                <Plus className="w-4 h-4 mr-2" />
                New Folder
              </DropdownMenuItem>
              <DropdownMenuItem onClick={toggleSelectMode}>
                <CheckSquare className="w-4 h-4 mr-2" />
                {selectMode ? 'Exit Select Mode' : 'Select Mode'}
              </DropdownMenuItem>
              {selectMode && (
                <>
                  <DropdownMenuItem onClick={handleSelectAll}>
                    <Check className="w-4 h-4 mr-2" />
                    Select All
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleDeselectAll}>
                    <Square className="w-4 h-4 mr-2" />
                    Deselect All
                  </DropdownMenuItem>
                  {selectedFiles.size > 0 && (
                    <DropdownMenuItem 
                      onClick={handleDeleteSelected}
                      className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete Selected ({selectedFiles.size})
                    </DropdownMenuItem>
                  )}
                </>
              )}
              <DropdownMenuItem onClick={() => toast({ title: 'Upload', description: 'Feature coming soon!' })}>
                <Upload className="w-4 h-4 mr-2" />
                Upload
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => toast({ title: 'Download', description: 'Feature coming soon!' })}>
                <Download className="w-4 h-4 mr-2" />
                Download ZIP
              </DropdownMenuItem>
            </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* File Tree */}
      <div className="flex-1 overflow-y-auto">
        {(isLoading && showLoadingIndicator) ? (
          <div className="p-4 text-center">
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="text-xs text-gray-400 mt-2">Loading files...</p>
          </div>
        ) : (
          <div className="py-2">
            {treeData.map(node => renderNode(node))}
            
            {/* Root level create input */}
            {creatingItem.show && !creatingItem.parentId && (
              <div className="flex items-center px-2 py-1 text-sm" style={{ paddingLeft: '8px' }}>
                {creatingItem.type === 'folder' ? (
                  <Folder className="w-4 h-4 text-yellow-500 mr-2 flex-shrink-0" />
                ) : (
                  <File className="w-4 h-4 text-gray-400 mr-2 flex-shrink-0" />
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
            )}
            
            {treeData.length === 0 && !creatingItem.show && (
              <div className="p-4 text-center text-gray-400 text-sm">
                No files yet. Create your first file or folder.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}