import { useState } from 'react';
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
  Download
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

export default function FileTree({ projectId, onFileSelect, selectedFile }: FileTreeProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expandedFolders, setExpandedFolders] = useState<Set<number>>(new Set([0])); // Root always expanded
  const [creatingItem, setCreatingItem] = useState<{
    type: 'file' | 'folder';
    parentId?: number;
    show: boolean;
  }>({ type: 'file', show: false });
  const [newItemName, setNewItemName] = useState('');

  // Fetch files for the project
  const { data: files = [], isLoading } = useQuery<FileNode[]>({
    queryKey: ['project-files', projectId],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/projects/${projectId}/files`);
      return response as FileNode[];
    },
    enabled: !!projectId,
  });

  // Create file/folder mutation
  const createMutation = useMutation({
    mutationFn: async (data: { name: string; type: 'file' | 'folder'; parentId?: number }) => {
      const parentPath = data.parentId 
        ? files?.find((f: FileNode) => f.id === data.parentId)?.path || ''
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
      toast({ title: 'Success', description: 'Item created successfully' });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Error', 
        description: error.message || 'Failed to create item',
        variant: 'destructive' 
      });
    },
  });

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

  const handleToggleExpand = (nodeId: number) => {
    setExpandedFolders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId);
      } else {
        newSet.add(nodeId);
      }
      return newSet;
    });
  };

  const handleCreateItem = (type: 'file' | 'folder', parentId?: number) => {
    setCreatingItem({ type, parentId, show: true });
    setNewItemName('');
    
    // Expand parent folder if needed
    if (parentId) {
      setExpandedFolders(prev => new Set(Array.from(prev).concat(parentId)));
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
  };

  const renderNode = (node: FileNode, depth: number = 0): React.ReactNode => {
    const isExpanded = expandedFolders.has(node.id);
    const hasChildren = node.children && node.children.length > 0;
    const isSelected = selectedFile?.id === node.id;

    return (
      <div key={node.id}>
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div
              className={`group flex items-center px-2 py-1 text-sm cursor-pointer hover:bg-slate-700 ${
                isSelected ? 'bg-slate-600 border-l-2 border-blue-500' : ''
              }`}
              style={{ paddingLeft: `${8 + depth * 16}px` }}
              onClick={() => {
                if (node.type === 'folder') {
                  handleToggleExpand(node.id);
                } else {
                  onFileSelect(node);
                }
              }}
            >
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
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent className="bg-slate-800 border-slate-600">
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

  const treeData = buildTree(files);

  return (
    <div className="w-64 bg-slate-800 border-r border-slate-700 flex flex-col">
      {/* Header */}
      <div className="p-3 border-b border-slate-700">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-200 uppercase tracking-wider">Files</h3>
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

      {/* File Tree */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
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