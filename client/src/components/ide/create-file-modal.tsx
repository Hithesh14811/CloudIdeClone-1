import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useIDE } from "@/hooks/useIDE";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { File, Folder } from "lucide-react";
import type { File as FileType } from "@shared/schema";

export default function CreateFileModal() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currentProject, showCreateModal, setShowCreateModal } = useIDE();
  const [fileName, setFileName] = useState("");
  const [selectedParent, setSelectedParent] = useState<string>("root");

  // Get files for folder selection
  const files = queryClient.getQueryData(["/api/projects", currentProject?.id, "files"]) as FileType[] | undefined;
  const folders = files?.filter((file: FileType) => file.isFolder) || [];

  const createFileMutation = useMutation({
    mutationFn: async (fileData: { name: string; isFolder: boolean; parentId?: number }) => {
      if (!currentProject) throw new Error("No project selected");
      
      const parentId = selectedParent === "root" ? null : parseInt(selectedParent);
      const parentPath = parentId ? files?.find((f: FileType) => f.id === parentId)?.path || "" : "";
      const fullPath = parentPath ? `${parentPath}/${fileData.name}` : `/${fileData.name}`;
      
      return await apiRequest("POST", `/api/projects/${currentProject.id}/files`, {
        ...fileData,
        parentId,
        path: fullPath,
        content: fileData.isFolder ? undefined : "",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: ["/api/projects", currentProject?.id, "files"] 
      });
      toast({ 
        title: "Success", 
        description: `${showCreateModal.type === "folder" ? "Folder" : "File"} created successfully` 
      });
      setShowCreateModal({ show: false, type: "file" });
      setFileName("");
      setSelectedParent("root");
    },
    onError: (error) => {
      toast({ 
        title: "Error", 
        description: error.message, 
        variant: "destructive" 
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fileName.trim()) {
      toast({
        title: "Error",
        description: "Please enter a name",
        variant: "destructive",
      });
      return;
    }

    createFileMutation.mutate({
      name: fileName.trim(),
      isFolder: showCreateModal.type === "folder",
      parentId: selectedParent === "root" ? undefined : parseInt(selectedParent),
    });
  };

  const handleClose = () => {
    setShowCreateModal({ show: false, type: "file" });
    setFileName("");
    setSelectedParent("root");
  };

  return (
    <Dialog open={showCreateModal.show} onOpenChange={handleClose}>
      <DialogContent className="bg-slate-800 border-slate-600 text-gray-200">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            {showCreateModal.type === "folder" ? (
              <Folder className="w-5 h-5 text-yellow-500" />
            ) : (
              <File className="w-5 h-5 text-gray-400" />
            )}
            <span>Create New {showCreateModal.type === "folder" ? "Folder" : "File"}</span>
          </DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="parent" className="text-gray-300">Location</Label>
            <Select value={selectedParent} onValueChange={setSelectedParent}>
              <SelectTrigger className="bg-slate-700 border-slate-600 text-gray-200">
                <SelectValue placeholder="Select parent folder" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-600">
                <SelectItem value="root" className="text-gray-200 hover:bg-slate-700">
                  📁 Root (/)
                </SelectItem>
                {folders.map((folder: FileType) => (
                  <SelectItem key={folder.id} value={folder.id.toString()} className="text-gray-200 hover:bg-slate-700">
                    📁 {folder.path}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="fileName" className="text-gray-300">
              {showCreateModal.type === "folder" ? "Folder" : "File"} Name
            </Label>
            <Input
              id="fileName"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              placeholder={`Enter ${showCreateModal.type} name...`}
              className="bg-slate-900 border-slate-600 text-gray-200 placeholder-gray-400 focus:border-blue-500"
              autoFocus
            />
          </div>
          
          <div className="flex justify-end space-x-2">
            <Button
              type="button"
              variant="ghost"
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-200"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createFileMutation.isPending || !fileName.trim()}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {createFileMutation.isPending ? "Creating..." : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
