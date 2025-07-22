import { useIDE } from "@/hooks/useIDE";
import { Button } from "@/components/ui/button";
import { X, FileText, FileCode } from "lucide-react";
import type { File as FileType } from "@shared/schema";

export default function TabBar() {
  const { openTabs, currentFile, switchToFile, closeFile } = useIDE();

  const getFileIcon = (file: FileType) => {
    const extension = file.name.split('.').pop()?.toLowerCase();
    switch (extension) {
      case 'js':
      case 'jsx':
      case 'ts':
      case 'tsx':
      case 'html':
      case 'css':
      case 'json':
        return <FileCode className="w-3 h-3 text-yellow-400" />;
      default:
        return <FileText className="w-3 h-3 text-gray-400" />;
    }
  };

  if (openTabs.length === 0) {
    return (
      <div className="bg-slate-700 border-b border-slate-600 h-10 flex items-center px-4">
        <span className="text-sm text-gray-400">No files open</span>
      </div>
    );
  }

  return (
    <div className="bg-slate-700 border-b border-slate-600 flex items-center overflow-x-auto scrollbar-thin scrollbar-thumb-slate-500 scrollbar-track-slate-700">
      <div className="flex min-w-0">
        {openTabs.map((file) => (
          <div
            key={file.id}
            className={`flex items-center px-4 py-2 text-sm cursor-pointer min-w-0 border-b-2 transition-colors ${
              currentFile?.id === file.id
                ? "bg-slate-900 border-blue-500 text-gray-200"
                : "bg-slate-700 border-transparent text-gray-400 hover:bg-slate-600 hover:text-gray-200"
            }`}
            onClick={() => switchToFile(file)}
          >
            {getFileIcon(file)}
            <span className="ml-2 truncate max-w-32">{file.name}</span>
            <Button
              variant="ghost"
              size="sm"
              className="ml-2 h-4 w-4 p-0 text-gray-400 hover:text-gray-200 hover:bg-slate-500"
              onClick={(e) => {
                e.stopPropagation();
                closeFile(file.id);
              }}
            >
              <X className="w-3 h-3" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
