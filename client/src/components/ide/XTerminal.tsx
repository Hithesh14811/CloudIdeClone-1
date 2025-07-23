import { useEffect, useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, Maximize2, Minus, Copy, X, Settings, Terminal as TerminalIcon, History } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useXTerminal } from '@/hooks/useXTerminal';
import { useToast } from '@/hooks/use-toast';

interface XTerminalProps {
  projectId?: string;
  onFileTreeUpdate?: (callback: (data: any) => void) => void;
}

interface TerminalTab {
  id: string;
  name: string;
  sessionId: string | null;
  isActive: boolean;
}

export default function XTerminal({ projectId, onFileTreeUpdate }: XTerminalProps) {
  const { user } = useAuth();
  const { terminal, isConnected, isReady, sessionId, startTerminal, stopTerminal, initializeTerminal, resizeTerminal, onFileTreeUpdate: setFileTreeUpdateCallback } = useXTerminal();
  const [isMinimized, setIsMinimized] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [terminals, setTerminals] = useState<TerminalTab[]>([
    { id: '1', name: 'Terminal 1', sessionId: null, isActive: true }
  ]);
  const [activeTerminalId, setActiveTerminalId] = useState('1');
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [terminalTheme, setTerminalTheme] = useState<'dark' | 'light'>('dark');
  const [fontSize, setFontSize] = useState(14);
  const [fontFamily, setFontFamily] = useState('JetBrains Mono');
  
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
    const newId = (terminals.length + 1).toString();
    const newTerminal: TerminalTab = {
      id: newId,
      name: `Terminal ${newId}`,
      sessionId: null,
      isActive: false
    };
    
    setTerminals(prev => [
      ...prev.map(t => ({ ...t, isActive: false })),
      { ...newTerminal, isActive: true }
    ]);
    setActiveTerminalId(newId);
    
    // Start new terminal session
    if (projectId && user) {
      setTimeout(() => {
        startTerminal(projectId, (user as any).id || "anonymous");
      }, 100);
    }
  }, [terminals, projectId, user, startTerminal]);

  const handleCloseTerminal = useCallback((terminalId: string) => {
    if (terminals.length === 1) {
      toast({ title: "Cannot close last terminal", variant: "destructive" });
      return;
    }

    const terminalToClose = terminals.find(t => t.id === terminalId);
    if (terminalToClose?.sessionId) {
      stopTerminal();
    }

    const newTerminals = terminals.filter(t => t.id !== terminalId);
    setTerminals(newTerminals);

    if (activeTerminalId === terminalId) {
      const nextActive = newTerminals[0];
      setActiveTerminalId(nextActive.id);
      if (nextActive.sessionId && projectId && user) {
        startTerminal(projectId, (user as any).id || "anonymous");
      }
    }
  }, [terminals, activeTerminalId, stopTerminal, startTerminal, projectId, user, toast]);

  const handleSwitchTerminal = useCallback((terminalId: string) => {
    setTerminals(prev => prev.map(t => ({
      ...t,
      isActive: t.id === terminalId
    })));
    setActiveTerminalId(terminalId);
    
    // Switch to the terminal session
    const targetTerminal = terminals.find(t => t.id === terminalId);
    if (targetTerminal?.sessionId && projectId && user) {
      startTerminal(projectId, (user as any).id || "anonymous");
    }
  }, [terminals, projectId, user, startTerminal]);

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

  const handlePasteFromClipboard = useCallback(() => {
    if (terminal && isReady) {
      navigator.clipboard.readText().then((text) => {
        terminal.paste(text);
      });
    }
  }, [terminal, isReady]);

  const handleSelectFromHistory = useCallback((command: string) => {
    if (terminal && isReady) {
      terminal.paste(command);
    }
    setShowHistory(false);
  }, [terminal, isReady]);

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
          e.preventDefault();
          handlePasteFromClipboard();
          break;
        case 't':
          e.preventDefault();
          handleNewTerminal();
          break;
        case 'w':
          if (terminals.length > 1) {
            e.preventDefault();
            handleCloseTerminal(activeTerminalId);
          }
          break;
      }
    }
  }, [terminal, isReady, handleClearTerminal, handleCopyOutput, handlePasteFromClipboard, handleNewTerminal, handleCloseTerminal, activeTerminalId, terminals.length]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyboardShortcuts);
    return () => {
      document.removeEventListener('keydown', handleKeyboardShortcuts);
    };
  }, [handleKeyboardShortcuts]);

  const toggleMaximize = useCallback(() => {
    setIsMaximized(!isMaximized);
  }, [isMaximized]);

  return (
    <div className={`bg-slate-900 border-t border-slate-700 flex flex-col transition-all duration-200 ${
      isMaximized ? 'fixed inset-0 z-50' : isMinimized ? "h-10" : "h-64"
    }`}>
      {/* Terminal header */}
      <div className="bg-slate-800 border-b border-slate-700 px-4 py-2 flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <TerminalIcon className="w-4 h-4 text-gray-400" />
            <h3 className="text-sm font-medium text-gray-200">TERMINAL</h3>
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'}`} 
                 title={isConnected ? 'Connected' : 'Disconnected'} />
          </div>
          
          {/* Terminal tabs */}
          <div className="flex items-center space-x-1">
            {terminals.map((term) => (
              <div
                key={term.id}
                className={`flex items-center px-2 py-1 rounded text-xs cursor-pointer ${
                  term.isActive 
                    ? 'bg-slate-700 text-gray-200' 
                    : 'bg-slate-600 text-gray-400 hover:bg-slate-700'
                }`}
                onClick={() => handleSwitchTerminal(term.id)}
              >
                <span>{term.name}</span>
                {terminals.length > 1 && (
                  <button
                    className="ml-1 hover:text-red-400"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCloseTerminal(term.id);
                    }}
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-gray-400 hover:text-gray-200 hover:bg-slate-700"
              onClick={handleNewTerminal}
              disabled={!projectId || !user}
              title="New Terminal (Ctrl+T)"
            >
              <Plus className="w-3 h-3 mr-1" />
              New
            </Button>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-gray-400 hover:text-gray-200 hover:bg-slate-700"
            onClick={() => setShowHistory(!showHistory)}
            title="Command History"
            disabled={commandHistory.length === 0}
          >
            <History className="w-3 h-3" />
          </Button>
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
            onClick={() => setShowSettings(!showSettings)}
            title="Terminal Settings"
          >
            <Settings className="w-3 h-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-gray-400 hover:text-gray-200 hover:bg-slate-700"
            onClick={toggleMaximize}
            title={isMaximized ? "Exit Fullscreen" : "Fullscreen"}
          >
            {isMaximized ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
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

      {/* Settings Panel */}
      {showSettings && !isMinimized && (
        <div className="bg-slate-800 border-b border-slate-700 p-4 shrink-0">
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <label className="block text-gray-300 mb-1">Theme</label>
              <select
                value={terminalTheme}
                onChange={(e) => setTerminalTheme(e.target.value as 'dark' | 'light')}
                className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-gray-200"
              >
                <option value="dark">Dark Theme</option>
                <option value="light">Light Theme</option>
              </select>
            </div>
            <div>
              <label className="block text-gray-300 mb-1">Font Size</label>
              <select
                value={fontSize}
                onChange={(e) => setFontSize(parseInt(e.target.value))}
                className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-gray-200"
              >
                <option value={12}>12px</option>
                <option value={14}>14px</option>
                <option value={16}>16px</option>
                <option value={18}>18px</option>
              </select>
            </div>
            <div>
              <label className="block text-gray-300 mb-1">Font Family</label>
              <select
                value={fontFamily}
                onChange={(e) => setFontFamily(e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-gray-200"
              >
                <option value="JetBrains Mono">JetBrains Mono</option>
                <option value="Fira Code">Fira Code</option>
                <option value="Monaco">Monaco</option>
                <option value="Consolas">Consolas</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Command History Panel */}
      {showHistory && !isMinimized && commandHistory.length > 0 && (
        <div className="bg-slate-800 border-b border-slate-700 p-4 shrink-0 max-h-32 overflow-y-auto">
          <div className="text-sm text-gray-300 mb-2">Command History</div>
          <div className="space-y-1">
            {commandHistory.slice(-10).reverse().map((cmd, index) => (
              <div
                key={index}
                className="text-xs text-gray-400 hover:text-gray-200 cursor-pointer hover:bg-slate-700 px-2 py-1 rounded"
                onClick={() => handleSelectFromHistory(cmd)}
              >
                {cmd}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Terminal content */}
      {!isMinimized && (
        <div className="flex-1 relative">
          <div
            ref={terminalRef}
            className="absolute inset-0 p-4"
            style={{ 
              fontFamily: `"${fontFamily}", "Fira Code", Consolas, "Courier New", monospace`,
              fontSize: `${fontSize}px`
            }}
          />
          
          {/* Loading overlay */}
          {!isReady && (
            <div className="absolute inset-0 bg-slate-900/80 flex items-center justify-center">
              <div className="text-center">
                <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                <div className="text-yellow-400 text-sm">
                  {!isConnected ? 'Connecting to terminal...' : 'Initializing shell...'}
                </div>
                <div className="text-xs text-gray-500 mt-2">
                  Secure Docker container • Full shell access
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* Help text */}
      {!isMinimized && isReady && (
        <div className="px-4 py-1 text-xs text-gray-500 border-t border-slate-700 shrink-0">
          <span>Shortcuts: </span>
          <span className="text-gray-400">
            Ctrl+L (clear) • Ctrl+C (copy) • Ctrl+V (paste) • Ctrl+T (new terminal) • Ctrl+W (close terminal)
          </span>
        </div>
      )}
    </div>
  );
}