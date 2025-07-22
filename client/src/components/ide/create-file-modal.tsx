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

export default function CreateFileModal() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currentProject, showCreateModal, setShowCreateModal } = useIDE();
  const [fileName, setFileName] = useState("");

  const createFileMutation = useMutation({
    mutationFn: async (fileData: { name: string; isFolder: boolean }) => {
      if (!currentProject) throw new Error("No project selected");
      return await apiRequest("POST", `/api/projects/${currentProject.id}/files`, {
        ...fileData,
        path: `/${fileData.name}`,
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
    });
  };

  const handleClose = () => {
    setShowCreateModal({ show: false, type: "file" });
    setFileName("");
  };

  return (
    <Dialog open={showCreateModal.show} onOpenChange={handleClose}>
      <DialogContent className="bg-slate-800 border-slate-600 text-gray-200">
        <DialogHeader>
          <DialogTitle>
            Create New {showCreateModal.type === "folder" ? "Folder" : "File"}
          </DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
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
