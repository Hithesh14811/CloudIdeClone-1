import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Play, Square, Loader2 } from 'lucide-react';

interface RunButtonProps {
  projectId: number;
  onRunStart?: () => void;
  onRunStop?: () => void;
}

export default function RunButton({ projectId, onRunStart, onRunStop }: RunButtonProps) {
  const { toast } = useToast();
  const [isRunning, setIsRunning] = useState(false);

  const runMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', `/api/projects/${projectId}/run`);
    },
    onSuccess: (data: any) => {
      setIsRunning(true);
      onRunStart?.();
      toast({
        title: 'Project Started',
        description: `${data.projectType.toUpperCase()} project is now running`,
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Run Failed',
        description: error.message || 'Failed to run project',
        variant: 'destructive',
      });
    },
  });

  const stopMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', `/api/projects/${projectId}/stop`);
    },
    onSuccess: () => {
      setIsRunning(false);
      onRunStop?.();
      toast({
        title: 'Project Stopped',
        description: 'Project execution has been terminated',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Stop Failed',
        description: error.message || 'Failed to stop project',
        variant: 'destructive',
      });
    },
  });

  const handleRun = () => {
    if (isRunning) {
      stopMutation.mutate();
    } else {
      runMutation.mutate();
    }
  };

  const isPending = runMutation.isPending || stopMutation.isPending;

  return (
    <Button
      onClick={handleRun}
      disabled={isPending}
      className={`
        ${isRunning 
          ? 'bg-red-600 hover:bg-red-700 text-white' 
          : 'bg-green-600 hover:bg-green-700 text-white'
        } transition-colors duration-200
      `}
      size="sm"
    >
      {isPending ? (
        <>
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          {isRunning ? 'Stopping...' : 'Starting...'}
        </>
      ) : isRunning ? (
        <>
          <Square className="w-4 h-4 mr-2" />
          Stop
        </>
      ) : (
        <>
          <Play className="w-4 h-4 mr-2" />
          Run
        </>
      )}
    </Button>
  );
}