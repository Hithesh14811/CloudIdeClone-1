import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Upload, Plus } from 'lucide-react';

interface FileUploadProps {
  projectId: number;
  onUploadComplete?: () => void;
}

export default function FileUpload({ projectId, onUploadComplete }: FileUploadProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [files, setFiles] = useState<FileList | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const uploadMutation = useMutation({
    mutationFn: async (uploadData: { files: Array<{ name: string; content: string; path: string }> }) => {
      return apiRequest('POST', `/api/projects/${projectId}/upload`, uploadData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-files', projectId] });
      setIsOpen(false);
      setFiles(null);
      toast({
        title: 'Success',
        description: 'Files uploaded successfully',
      });
      onUploadComplete?.();
    },
    onError: (error: any) => {
      toast({
        title: 'Upload Failed',
        description: error.message || 'Failed to upload files',
        variant: 'destructive',
      });
    },
  });

  const handleFileSelect = (selectedFiles: FileList) => {
    setFiles(selectedFiles);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles.length > 0) {
      setFiles(droppedFiles);
    }
  };

  const handleUpload = async () => {
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    const uploadFiles: Array<{ name: string; content: string; path: string }> = [];

    for (const file of fileArray) {
      if (file.type.startsWith('text/') || file.name.endsWith('.js') || 
          file.name.endsWith('.html') || file.name.endsWith('.css') || 
          file.name.endsWith('.json') || file.name.endsWith('.md')) {
        try {
          const content = await file.text();
          uploadFiles.push({
            name: file.name,
            content,
            path: `/${file.name}`,
          });
        } catch (error) {
          toast({
            title: 'Error',
            description: `Failed to read file: ${file.name}`,
            variant: 'destructive',
          });
        }
      } else {
        toast({
          title: 'Unsupported File',
          description: `File type not supported: ${file.name}`,
          variant: 'destructive',
        });
      }
    }

    if (uploadFiles.length > 0) {
      uploadMutation.mutate({ files: uploadFiles });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button 
          variant="ghost" 
          size="sm"
          className="h-6 px-2 text-xs text-gray-400 hover:text-gray-200 hover:bg-slate-700"
        >
          <Upload className="w-3 h-3 mr-1" />
          Upload
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-slate-800 border-slate-700 text-gray-200">
        <DialogHeader>
          <DialogTitle>Upload Files</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div
            className={`
              border-2 border-dashed rounded-lg p-8 text-center transition-colors
              ${isDragOver ? 'border-blue-400 bg-blue-950/20' : 'border-slate-600'}
            `}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <Upload className="w-12 h-12 mx-auto mb-4 text-gray-400" />
            <p className="text-sm text-gray-400 mb-2">
              Drag and drop files here, or click to select
            </p>
            <Input
              type="file"
              multiple
              accept=".js,.html,.css,.json,.md,.txt,.py,.jsx,.tsx,.ts"
              onChange={(e) => e.target.files && handleFileSelect(e.target.files)}
              className="hidden"
              id="file-upload"
            />
            <Button
              variant="outline"
              onClick={() => document.getElementById('file-upload')?.click()}
              className="border-slate-600 hover:bg-slate-700"
            >
              Select Files
            </Button>
          </div>
          
          {files && files.length > 0 && (
            <div>
              <p className="text-sm text-gray-400 mb-2">
                Selected files ({files.length}):
              </p>
              <div className="max-h-32 overflow-y-auto">
                {Array.from(files).map((file, index) => (
                  <div key={index} className="text-xs text-gray-300 py-1">
                    {file.name} ({Math.round(file.size / 1024)}KB)
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end space-x-2 pt-4">
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleUpload}
              disabled={!files || files.length === 0 || uploadMutation.isPending}
            >
              {uploadMutation.isPending ? 'Uploading...' : 'Upload Files'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}