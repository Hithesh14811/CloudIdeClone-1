import { useState, useEffect, useRef } from "react";
import { useIDE } from "@/hooks/useIDE";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Minus, Maximize2 } from "lucide-react";

export default function Terminal() {
  const { currentProject } = useIDE();
  const [isMinimized, setIsMinimized] = useState(false);
  const [terminalOutput, setTerminalOutput] = useState<string[]>([
    "Welcome to Shetty Terminal",
    `Type 'help' for available commands`,
  ]);
  const [currentCommand, setCurrentCommand] = useState("");
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const terminalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Auto scroll to bottom when new output is added
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [terminalOutput]);

  const handleClearTerminal = () => {
    setTerminalOutput(["Terminal cleared"]);
  };

  const handleNewTerminal = () => {
    setTerminalOutput(["Welcome to Shetty Terminal", `Type 'help' for available commands`]);
  };

  const executeCommand = (command: string) => {
    const trimmedCommand = command.trim();
    if (!trimmedCommand) return;

    // Add command to history
    setCommandHistory(prev => [...prev, trimmedCommand]);
    setHistoryIndex(-1);
    
    // Add command to output
    setTerminalOutput(prev => [...prev, `$ ${trimmedCommand}`]);

    // Handle different commands
    switch (trimmedCommand.toLowerCase()) {
      case 'help':
        setTerminalOutput(prev => [...prev, 
          "Available commands:",
          "  help       - Show this help message",
          "  clear      - Clear the terminal",
          "  ls         - List files in current project",
          "  pwd        - Show current directory",
          "  whoami     - Show current user",
          "  date       - Show current date and time",
          "  echo <msg> - Echo a message",
          "  node -v    - Show Node.js version",
          "  npm -v     - Show npm version",
        ]);
        break;
      
      case 'clear':
        setTerminalOutput(["Welcome to Shetty Terminal", `Type 'help' for available commands`]);
        return;
        
      case 'ls':
        // This would ideally fetch actual project files
        setTerminalOutput(prev => [...prev, 
          "index.html",
          "script.js", 
          "style.css",
          "package.json"
        ]);
        break;
        
      case 'pwd':
        setTerminalOutput(prev => [...prev, `/home/user/projects/${currentProject?.name || 'untitled'}`]);
        break;
        
      case 'whoami':
        setTerminalOutput(prev => [...prev, "shetty-user"]);
        break;
        
      case 'date':
        setTerminalOutput(prev => [...prev, new Date().toLocaleString()]);
        break;
        
      case 'node -v':
        setTerminalOutput(prev => [...prev, "v18.17.0"]);
        break;
        
      case 'npm -v':
        setTerminalOutput(prev => [...prev, "9.6.7"]);
        break;
        
      default:
        if (trimmedCommand.startsWith('echo ')) {
          const message = trimmedCommand.substring(5);
          setTerminalOutput(prev => [...prev, message]);
        } else {
          setTerminalOutput(prev => [...prev, `Command not found: ${trimmedCommand}. Type 'help' for available commands.`]);
        }
        break;
    }
  };

  const handleCommandSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (currentCommand.trim()) {
      executeCommand(currentCommand);
      setCurrentCommand("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (commandHistory.length > 0) {
        const newIndex = historyIndex === -1 ? commandHistory.length - 1 : Math.max(0, historyIndex - 1);
        setHistoryIndex(newIndex);
        setCurrentCommand(commandHistory[newIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > -1) {
        const newIndex = historyIndex + 1;
        if (newIndex >= commandHistory.length) {
          setHistoryIndex(-1);
          setCurrentCommand("");
        } else {
          setHistoryIndex(newIndex);
          setCurrentCommand(commandHistory[newIndex]);
        }
      }
    }
  };

  return (
    <div className={`bg-slate-900 border-t border-slate-700 flex flex-col transition-all duration-200 ${
      isMinimized ? "h-10" : "h-64"
    }`}>
      {/* Terminal header */}
      <div className="bg-slate-800 border-b border-slate-700 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <h3 className="text-sm font-medium text-gray-200">TERMINAL</h3>
          <div className="flex space-x-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-gray-400 hover:text-gray-200 hover:bg-slate-700"
              onClick={handleNewTerminal}
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
            onClick={handleClearTerminal}
            title="Clear Terminal"
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
        <>
          <div 
            ref={terminalRef}
            className="flex-1 font-mono text-sm overflow-y-auto scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-slate-800 p-4"
          >
            <div className="space-y-1">
              {terminalOutput.map((line, index) => (
                <div key={index} className={`${
                  line.startsWith('$') ? 'text-gray-400' :
                  line.startsWith('✓') ? 'text-green-400' :
                  line.startsWith('✗') || line.includes('error') ? 'text-red-400' :
                  line.includes('http://') ? 'text-blue-400' :
                  'text-gray-300'
                }`}>
                  {line}
                </div>
              ))}
            </div>
          </div>
          
          {/* Command input */}
          <div className="border-t border-slate-700 p-4">
            <form onSubmit={handleCommandSubmit} className="flex items-center space-x-2">
              <span className="text-gray-400 font-mono text-sm">$</span>
              <Input
                ref={inputRef}
                value={currentCommand}
                onChange={(e) => setCurrentCommand(e.target.value)}
                onKeyDown={handleKeyDown}
                className="flex-1 bg-transparent border-none text-gray-200 font-mono text-sm focus:ring-0 p-0"
                placeholder="Enter command..."
                autoComplete="off"
              />
            </form>
          </div>
        </>
      )}
    </div>
  );
}
