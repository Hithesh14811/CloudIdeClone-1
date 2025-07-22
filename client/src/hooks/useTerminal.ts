import { useState, useEffect, useCallback } from 'react';
import { useSocket } from './useSocket';

interface TerminalHook {
  output: string[];
  isConnected: boolean;
  isReady: boolean;
  sendCommand: (command: string) => void;
  startTerminal: (projectId: string, userId: string) => void;
  stopTerminal: () => void;
  clearTerminal: () => void;
}

export function useTerminal(): TerminalHook {
  const socket = useSocket();
  const [output, setOutput] = useState<string[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    if (!socket) return;

    // Socket event handlers
    socket.on('terminal:ready', (data: { sessionId: string }) => {
      setSessionId(data.sessionId);
      setIsReady(true);
      setIsConnected(true);
    });

    socket.on('terminal:output', (data: string) => {
      setOutput(prev => [...prev, data]);
    });

    socket.on('terminal:error', (data: { message: string }) => {
      setOutput(prev => [...prev, `Error: ${data.message}`]);
    });

    socket.on('terminal:stopped', () => {
      setIsReady(false);
      setIsConnected(false);
      setSessionId(null);
    });

    return () => {
      socket.off('terminal:ready');
      socket.off('terminal:output');
      socket.off('terminal:error');
      socket.off('terminal:stopped');
    };
  }, [socket]);

  const startTerminal = useCallback((projectId: string, userId: string) => {
    if (socket && !isConnected) {
      socket.emit('terminal:start', { projectId, userId });
    }
  }, [socket, isConnected]);

  const sendCommand = useCallback((command: string) => {
    if (socket && sessionId && isReady) {
      socket.emit('terminal:input', { sessionId, input: command });
    }
  }, [socket, sessionId, isReady]);

  const stopTerminal = useCallback(() => {
    if (socket && sessionId) {
      socket.emit('terminal:stop', { sessionId });
    }
  }, [socket, sessionId]);

  const clearTerminal = useCallback(() => {
    setOutput([]);
  }, []);

  return {
    output,
    isConnected,
    isReady,
    sendCommand,
    startTerminal,
    stopTerminal,
    clearTerminal
  };
}