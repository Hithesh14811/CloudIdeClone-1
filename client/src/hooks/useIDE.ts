import { useState, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Project, File as FileType } from "@shared/schema";

interface CreateModalState {
  show: boolean;
  type: "file" | "folder";
}

export function useIDE(projectId?: string) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [openTabs, setOpenTabs] = useState<FileType[]>([]);
  const [currentFile, setCurrentFile] = useState<FileType | null>(null);
  const [showCreateModal, setShowCreateModal] = useState<CreateModalState>({ 
    show: false, 
    type: "file" 
  });

  // Fetch specific project if projectId is provided
  const { data: project } = useQuery({
    queryKey: ["/api/projects", projectId],
    enabled: !!projectId,
  });

  // Set current project when project data is loaded
  useEffect(() => {
    if (project) {
      setCurrentProject(project as Project);
    }
  }, [project]);

  // File update mutation
  const updateFileMutation = useMutation({
    mutationFn: async ({ fileId, content }: { fileId: number; content: string }) => {
      return await apiRequest("PUT", `/api/files/${fileId}`, { content });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: ["/api/projects", currentProject?.id, "files"] 
      });
    },
    onError: (error) => {
      toast({ 
        title: "Error", 
        description: "Failed to save file", 
        variant: "destructive" 
      });
    },
  });

  const openFile = useCallback((file: FileType) => {
    // Add to open tabs if not already open
    setOpenTabs(prev => {
      const exists = prev.find(f => f.id === file.id);
      if (!exists) {
        return [...prev, file];
      }
      return prev;
    });
    
    // Set as current file
    setCurrentFile(file);
  }, []);

  const closeFile = useCallback((fileId: number) => {
    setOpenTabs(prev => {
      const newTabs = prev.filter(f => f.id !== fileId);
      
      // If we're closing the current file, switch to another tab
      if (currentFile?.id === fileId) {
        const nextFile = newTabs.length > 0 ? newTabs[newTabs.length - 1] : null;
        setCurrentFile(nextFile);
      }
      
      return newTabs;
    });
  }, [currentFile]);

  const switchToFile = useCallback((file: FileType) => {
    setCurrentFile(file);
  }, []);

  const updateFileContent = useCallback((fileId: number, content: string) => {
    // Update the file content in open tabs
    setOpenTabs(prev => 
      prev.map(file => 
        file.id === fileId ? { ...file, content } : file
      )
    );
    
    // Update current file if it's the one being edited
    if (currentFile?.id === fileId) {
      setCurrentFile(prev => prev ? { ...prev, content } : null);
    }
  }, [currentFile]);

  const saveCurrentFile = useCallback(async () => {
    if (!currentFile) {
      throw new Error("No file to save");
    }
    
    return updateFileMutation.mutateAsync({
      fileId: currentFile.id,
      content: currentFile.content || "",
    });
  }, [currentFile, updateFileMutation]);

  const runProject = useCallback(() => {
    toast({ 
      title: "Running Project", 
      description: `Starting ${currentProject?.name}...` 
    });
    // Mock project run - in real implementation would start Docker container
  }, [currentProject, toast]);

  return {
    // State
    currentProject,
    setCurrentProject,
    openTabs,
    currentFile,
    showCreateModal,
    setShowCreateModal,
    
    // Actions
    openFile,
    closeFile,
    switchToFile,
    updateFileContent,
    saveCurrentFile,
    runProject,
    
    // Loading states
    isSaving: updateFileMutation.isPending,
  };
}
