import { useState, useEffect, useCallback } from 'react';
import { useSocket } from './useSocket';

interface PreviewHook {
  previewUrl: string | null;
  isLoading: boolean;
  isReady: boolean;
  startPreview: (projectId: string, userId: string) => void;
  stopPreview: () => void;
  refreshPreview: () => void;
}

export function usePreview(): PreviewHook {
  const socket = useSocket();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    if (!socket) return;

    // Socket event handlers
    socket.on('preview:ready', (data: { sessionId: string, previewUrl: string }) => {
      setSessionId(data.sessionId);
      setPreviewUrl(data.previewUrl);
      setIsReady(true);
      setIsLoading(false);
    });

    socket.on('preview:refreshed', (data: { previewUrl: string }) => {
      setPreviewUrl(data.previewUrl + '?t=' + Date.now()); // Add timestamp for cache busting
    });

    socket.on('preview:live-reload', () => {
      // Trigger a reload of the preview
      if (previewUrl) {
        setPreviewUrl(previewUrl + '?t=' + Date.now());
      }
    });

    socket.on('preview:error', (data: { message: string }) => {
      console.error('Preview error:', data.message);
      setIsLoading(false);
    });

    socket.on('preview:stopped', () => {
      setPreviewUrl(null);
      setIsReady(false);
      setSessionId(null);
      setIsLoading(false);
    });

    return () => {
      socket.off('preview:ready');
      socket.off('preview:refreshed');
      socket.off('preview:live-reload');
      socket.off('preview:error');
      socket.off('preview:stopped');
    };
  }, [socket, previewUrl]);

  const startPreview = useCallback((projectId: string, userId: string) => {
    if (socket && !isReady) {
      setIsLoading(true);
      socket.emit('preview:start', { projectId, userId });
    }
  }, [socket, isReady]);

  const stopPreview = useCallback(() => {
    if (socket && sessionId) {
      socket.emit('preview:stop', { sessionId });
    }
  }, [socket, sessionId]);

  const refreshPreview = useCallback(() => {
    if (socket && sessionId) {
      socket.emit('preview:refresh', { sessionId });
    }
  }, [socket, sessionId]);

  return {
    previewUrl,
    isLoading,
    isReady,
    startPreview,
    stopPreview,
    refreshPreview
  };
}