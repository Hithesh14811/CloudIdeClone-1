import { useEffect, useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, Maximize2, Minus, Copy } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useXTerminal } from '@/hooks/useXTerminal';
import { useToast } from '@/hooks/use-toast';

interface XTerminalProps {
  projectId?: string;
  onFileTreeUpdate?: (callback: (data: any) => void) => void;
}

export default function XTerminal({ projectId, onFileTreeUpdate }: XTerminalProps) {
  const { user } = useAuth();
  const { terminal, isConnected, isReady, sessionId, startTerminal, stopTerminal, initializeTerminal, resizeTerminal, onFileTreeUpdate: setFileTreeUpdateCallback } = useXTerminal();
  const [isMinimized, setIsMinimized] = useState(false);
  const terminalRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Initialize terminal when component mounts
  useEffect(() => {
    if (terminalRef.current && !terminal) {
      initializeTerminal(terminalRef.current);
    }
  }, [terminal, initializeTerminal]);

  // Set up file tree update callback
  useEffect(() => {
    if (setFileTreeUpdateCallback && onFileTreeUpdate) {
      setFileTreeUpdateCallback((data) => {
        // Forward to parent component
        onFileTreeUpdate((callback) => callback(data));
      });
    }
  }, [setFileTreeUpdateCallback, onFileTreeUpdate]);

  // Start terminal session when component mounts and terminal is initialized
  useEffect(() => {
    if (projectId && user && terminal && !sessionId) {
      startTerminal(projectId, (user as any).id || "anonymous");
    }
  }, [projectId, user, terminal, sessionId, startTerminal]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      setTimeout(() => {
        resizeTerminal();
      }, 100);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [resizeTerminal]);

  // Handle container resize when minimized state changes
  useEffect(() => {
    if (!isMinimized) {
      setTimeout(() => {
        resizeTerminal();
      }, 200);
    }
  }, [isMinimized, resizeTerminal]);

  const handleClearTerminal = useCallback(() => {
    if (terminal) {
      terminal.clear();
    }
  }, [terminal]);

  const handleNewTerminal = useCallback(() => {
    if (projectId && user) {
      stopTerminal();
      setTimeout(() => {
        startTerminal(projectId, (user as any).id || "anonymous");
      }, 1000);
    }
  }, [projectId, user, stopTerminal, startTerminal]);

  const handleCopyOutput = useCallback(() => {
    if (terminal) {
      const selection = terminal.getSelection();
      if (selection) {
        navigator.clipboard.writeText(selection).then(() => {
          toast({ title: "Copied to clipboard" });
        });
      } else {
        toast({ title: "No text selected", variant: "destructive" });
      }
    }
  }, [terminal, toast]);

  const handleKeyboardShortcuts = useCallback((e: KeyboardEvent) => {
    if (e.ctrlKey) {
      switch (e.key.toLowerCase()) {
        case 'l':
          e.preventDefault();
          handleClearTerminal();
          break;
        case 'c':
          if (terminal && terminal.hasSelection()) {
            e.preventDefault();
            handleCopyOutput();
          }
          break;
        case 'v':
          if (terminal) {
            e.preventDefault();
            navigator.clipboard.readText().then((text) => {
              if (terminal && isReady) {
                terminal.paste(text);
              }
            });
          }
          break;
      }
    }
  }, [terminal, isReady, handleClearTerminal, handleCopyOutput]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyboardShortcuts);
    return () => {
      document.removeEventListener('keydown', handleKeyboardShortcuts);
    };
  }, [handleKeyboardShortcuts]);

  return (
    <div className={`bg-slate-900 border-t border-slate-700 flex flex-col transition-all duration-200 ${
      isMinimized ? "h-10" : "h-64"
    }`}>
      {/* Terminal header */}
      <div className="bg-slate-800 border-b border-slate-700 px-4 py-2 flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-4">
          <h3 className="text-sm font-medium text-gray-200">TERMINAL</h3>
          <div className="flex items-center space-x-1">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'}`} title={isConnected ? 'Connected' : 'Disconnected'} />
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-gray-400 hover:text-gray-200 hover:bg-slate-700"
              onClick={handleNewTerminal}
              disabled={!projectId || !user}
            >
              <Plus className="w-3 h-3 mr-1" />
              New Terminal
            </Button>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-gray-400 hover:text-gray-200 hover:bg-slate-700"
            onClick={handleCopyOutput}
            title="Copy Selected Text (Ctrl+C)"
            disabled={!terminal}
          >
            <Copy className="w-3 h-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-gray-400 hover:text-gray-200 hover:bg-slate-700"
            onClick={handleClearTerminal}
            title="Clear Terminal (Ctrl+L)"
            disabled={!terminal}
          >
            <Trash2 className="w-3 h-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-gray-400 hover:text-gray-200 hover:bg-slate-700"
            onClick={() => setIsMinimized(!isMinimized)}
            title={isMinimized ? "Maximize" : "Minimize"}
          >
            {isMinimized ? (
              <Maximize2 className="w-3 h-3" />
            ) : (
              <Minus className="w-3 h-3" />
            )}
          </Button>
        </div>
      </div>

      {/* Terminal content */}
      {!isMinimized && (
        <div className="flex-1 relative">
          <div
            ref={terminalRef}
            className="absolute inset-0 p-4"
            style={{ 
              fontFamily: '"JetBrains Mono", "Fira Code", Consolas, "Courier New", monospace'
            }}
          />
          
          {/* Loading overlay */}
          {!isReady && (
            <div className="absolute inset-0 bg-slate-900/80 flex items-center justify-center">
              <div className="text-yellow-400 text-sm">
                {!isConnected ? 'Connecting to terminal...' : 'Initializing shell...'}
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* Help text */}
      {!isMinimized && isReady && (
        <div className="px-4 py-1 text-xs text-gray-500 border-t border-slate-700">
          Shortcuts: Ctrl+L (clear), Ctrl+C (copy), Ctrl+V (paste)
        </div>
      )}
    </div>
  );
}