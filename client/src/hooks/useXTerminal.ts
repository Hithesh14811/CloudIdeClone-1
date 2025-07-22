import { useCallback, useState, useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { useSocket } from './useSocket';

interface XTerminalHook {
  terminal: Terminal | null;
  isConnected: boolean;
  isReady: boolean;
  sessionId: string | null;
  startTerminal: (projectId: string, userId: string) => void;
  stopTerminal: () => void;
  initializeTerminal: (element: HTMLElement) => void;
  resizeTerminal: () => void;
}

export function useXTerminal(): XTerminalHook {
  const socket = useSocket();
  const [terminal, setTerminal] = useState<Terminal | null>(null);
  const [fitAddon, setFitAddon] = useState<FitAddon | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const terminalElement = useRef<HTMLElement | null>(null);

  const initializeTerminal = useCallback((element: HTMLElement) => {
    if (!element || terminal) return;

    const newTerminal = new Terminal({
      fontFamily: '"JetBrains Mono", "Fira Code", Consolas, "Courier New", monospace',
      fontSize: 14,
      fontWeight: 'normal',
      fontWeightBold: 'bold',
      lineHeight: 1.2,
      letterSpacing: 0,
      theme: {
        background: '#0f172a', // slate-900
        foreground: '#cbd5e1', // slate-300
        cursor: '#cbd5e1',
        cursorAccent: '#0f172a',
        selectionBackground: '#334155', // slate-700
        black: '#1e293b', // slate-800
        red: '#ef4444', // red-500
        green: '#22c55e', // green-500
        yellow: '#eab308', // yellow-500
        blue: '#3b82f6', // blue-500
        magenta: '#a855f7', // purple-500
        cyan: '#06b6d4', // cyan-500
        white: '#f1f5f9', // slate-100
        brightBlack: '#475569', // slate-600
        brightRed: '#f87171', // red-400
        brightGreen: '#4ade80', // green-400
        brightYellow: '#facc15', // yellow-400
        brightBlue: '#60a5fa', // blue-400
        brightMagenta: '#c084fc', // purple-400
        brightCyan: '#22d3ee', // cyan-400
        brightWhite: '#ffffff'
      },
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 10000,
      tabStopWidth: 4,
      allowProposedApi: true
    });

    const newFitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    
    newTerminal.loadAddon(newFitAddon);
    newTerminal.loadAddon(webLinksAddon);
    
    newTerminal.open(element);
    newFitAddon.fit();
    
    terminalElement.current = element;
    setTerminal(newTerminal);
    setFitAddon(newFitAddon);

    // Focus the terminal
    newTerminal.focus();
  }, [terminal]);

  const resizeTerminal = useCallback(() => {
    if (fitAddon && terminal && sessionId && socket) {
      fitAddon.fit();
      const { cols, rows } = terminal;
      socket.emit('terminal:resize', { sessionId, cols, rows });
    }
  }, [fitAddon, terminal, sessionId, socket]);

  useEffect(() => {
    if (!socket || !terminal) return;

    // Handle terminal input
    const handleTerminalData = (data: string) => {
      if (sessionId) {
        socket.emit('terminal:input', { sessionId, input: data });
      }
    };

    terminal.onData(handleTerminalData);

    // Socket event handlers
    socket.on('terminal:ready', (data: { sessionId: string, cols: number, rows: number }) => {
      setSessionId(data.sessionId);
      setIsReady(true);
      setIsConnected(true);
    });

    socket.on('terminal:output', (data: string) => {
      terminal.write(data);
    });

    socket.on('terminal:error', (data: { message: string }) => {
      terminal.write(`\r\n\x1b[31mError: ${data.message}\x1b[0m\r\n`);
    });

    socket.on('terminal:exit', (data: { code: number }) => {
      terminal.write(`\r\n\x1b[33mProcess exited with code ${data.code}\x1b[0m\r\n`);
      setIsReady(false);
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
      socket.off('terminal:exit');
      socket.off('terminal:stopped');
      terminal.dispose();
    };
  }, [socket, terminal, sessionId]);

  const startTerminal = useCallback((projectId: string, userId: string) => {
    if (socket && terminal && !sessionId) {
      setIsConnected(false);
      setIsReady(false);
      socket.emit('terminal:start', { projectId, userId });
    }
  }, [socket, terminal, sessionId]);

  const stopTerminal = useCallback(() => {
    if (socket && sessionId) {
      socket.emit('terminal:stop', { sessionId });
    }
  }, [socket, sessionId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (terminal) {
        terminal.dispose();
      }
    };
  }, [terminal]);

  return {
    terminal,
    isConnected,
    isReady,
    sessionId,
    startTerminal,
    stopTerminal,
    initializeTerminal,
    resizeTerminal
  };
}