import { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface FileNode {
  id: number;
  name: string;
  type: 'file' | 'folder';
  path: string;
  content?: string;
  parentId?: number;
}

interface TabsProps {
  openTabs: FileNode[];
  activeTab?: FileNode;
  onTabSelect: (file: FileNode) => void;
  onTabClose: (file: FileNode) => void;
}

export default function Tabs({ openTabs, activeTab, onTabSelect, onTabClose }: TabsProps) {
  if (openTabs.length === 0) {
    return (
      <div className="h-10 bg-slate-800 border-b border-slate-700 flex items-center px-4">
        <span className="text-xs text-gray-500">No files open</span>
      </div>
    );
  }

  return (
    <div className="h-10 bg-slate-800 border-b border-slate-700 flex items-center overflow-x-auto scrollbar-thin scrollbar-thumb-slate-600">
      {openTabs.map((file) => (
        <div
          key={file.id}
          className={`group flex items-center min-w-0 border-r border-slate-700 ${
            activeTab?.id === file.id
              ? 'bg-slate-900 text-gray-200'
              : 'bg-slate-800 text-gray-400 hover:text-gray-200 hover:bg-slate-750'
          }`}
        >
          <button
            className="flex items-center px-3 py-2 min-w-0 flex-1 text-left"
            onClick={() => onTabSelect(file)}
            title={file.path}
          >
            <span className="text-xs truncate max-w-32">{file.name}</span>
          </button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 mr-1 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-200 hover:bg-slate-600"
            onClick={(e) => {
              e.stopPropagation();
              onTabClose(file);
            }}
          >
            <X className="w-3 h-3" />
          </Button>
        </div>
      ))}
    </div>
  );
}