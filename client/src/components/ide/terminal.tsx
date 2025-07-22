import { useState, useEffect, useRef } from "react";
import { useIDE } from "@/hooks/useIDE";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Minus, Maximize2 } from "lucide-react";

export default function Terminal() {
  const { currentProject } = useIDE();
  const [isMinimized, setIsMinimized] = useState(false);
  const [terminalOutput, setTerminalOutput] = useState<string[]>([
    "Welcome to Shetty Terminal",
    "$ npm install",
    "✓ Packages installed successfully",
    "$ npm start",
    "Starting the development server...",
    "✓ Compiled successfully!",
    "Local: http://localhost:3000",
    "On Your Network: http://192.168.1.100:3000",
  ]);
  const terminalRef = useRef<HTMLDivElement>(null);

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
    setTerminalOutput(prev => [...prev, "", "$ # New terminal session"]);
  };

  // Mock terminal commands
  const mockCommands = [
    "$ ls -la",
    "drwxr-xr-x  3 user user  4096 Jan 22 10:30 .",
    "drwxr-xr-x  5 user user  4096 Jan 22 10:25 ..",
    "-rw-r--r--  1 user user   156 Jan 22 10:30 index.html",
    "-rw-r--r--  1 user user   245 Jan 22 10:29 script.js",
    "-rw-r--r--  1 user user   128 Jan 22 10:28 style.css",
    "",
    "$ git status",
    "On branch main",
    "Your branch is up to date with 'origin/main'.",
    "",
    "Changes not staged for commit:",
    "  (use \"git add <file>...\" to update what will be committed)",
    "  (use \"git restore <file>...\" to discard changes in working directory)",
    "\tmodified:   script.js",
    "",
    "no changes added to commit (use \"git add\" or commit -a)",
  ];

  // Simulate periodic terminal updates
  useEffect(() => {
    const interval = setInterval(() => {
      if (Math.random() < 0.1) { // 10% chance every 5 seconds
        const randomCommand = mockCommands[Math.floor(Math.random() * mockCommands.length)];
        setTerminalOutput(prev => [...prev, randomCommand]);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, []);

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
            <div className="text-gray-400 flex items-center">
              $ <span className="ml-2 w-2 h-4 bg-gray-400 animate-pulse"></span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
