import { useState, useEffect, useRef } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { 
  Bot, 
  User, 
  Send, 
  Settings, 
  FileText, 
  Terminal, 
  Play, 
  Stop, 
  Save, 
  Trash2, 
  Plus,
  Code,
  Zap,
  Brain,
  Cpu,
  Sparkles
} from "lucide-react";

interface Message {
  id: string;
  content: string;
  sender: "user" | "ai";
  timestamp: Date;
  actions?: AIAction[];
  status?: 'success' | 'error' | 'pending';
}

interface AIAction {
  type: 'create_file' | 'update_file' | 'delete_file' | 'run_command' | 'install_package' | 'create_component';
  target: string;
  content?: string;
  result?: string;
  status: 'pending' | 'success' | 'error';
}

interface AIModel {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
  icon: React.ReactNode;
}

interface AIAssistantProps {
  projectId?: string;
  onFileSelect?: (fileId: number) => void;
  onRunCommand?: (command: string) => void;
}

const AI_MODELS: AIModel[] = [
  {
    id: 'gpt-4',
    name: 'GPT-4',
    description: 'Most capable model for complex coding tasks',
    capabilities: ['Code Generation', 'Debugging', 'Architecture', 'Testing'],
    icon: <Brain className="w-4 h-4" />
  },
  {
    id: 'gpt-3.5-turbo',
    name: 'GPT-3.5 Turbo',
    description: 'Fast and efficient for most coding tasks',
    capabilities: ['Code Generation', 'Debugging', 'Refactoring'],
    icon: <Zap className="w-4 h-4" />
  },
  {
    id: 'claude-3',
    name: 'Claude 3',
    description: 'Excellent for code analysis and documentation',
    capabilities: ['Code Review', 'Documentation', 'Analysis'],
    icon: <Cpu className="w-4 h-4" />
  },
  {
    id: 'codellama',
    name: 'Code Llama',
    description: 'Specialized for code completion and generation',
    capabilities: ['Code Completion', 'Code Generation', 'Debugging'],
    icon: <Code className="w-4 h-4" />
  }
];

export default function AIAssistant({ projectId, onFileSelect, onRunCommand }: AIAssistantProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      content: `🚀 **Shetty IDE AI Assistant** - Your Complete Development Partner

I can help you with literally everything in your workspace:

**📁 File Operations:**
• Create, edit, delete, and organize files
• Generate complete project structures
• Import/export code between files

**⚡ Command Execution:**  
• Run terminal commands (npm, git, build tools)
• Install packages and dependencies
• Start/stop development servers

**🎨 Code Generation:**
• Create React/Vue/Angular components
• Generate API endpoints and databases
• Build complete applications from scratch

**🔧 Development Tasks:**
• Debug and fix code issues
• Optimize performance and refactor
• Write tests and documentation

**🌐 Framework Support:**
• React, Vue, Angular, Svelte
• Node.js, Express, FastAPI, Django
• Next.js, Nuxt, SvelteKit

Just tell me what you want to build or fix, and I'll handle everything!`,
      sender: "ai",
      timestamp: new Date(),
    },
  ]);
  
  const [inputValue, setInputValue] = useState("");
  const [selectedModel, setSelectedModel] = useState('gpt-4');
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeTab, setActiveTab] = useState('chat');

  // Fetch project files for AI context
  const { data: projectFiles = [] } = useQuery({
    queryKey: ['project-files', projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const response = await apiRequest('GET', `/api/projects/${projectId}/files`);
      return response as any[];
    },
    enabled: !!projectId,
  });

  // AI Chat mutation with full capabilities
  const sendMessageMutation = useMutation({
    mutationFn: async (message: string) => {
      if (!projectId) {
        throw new Error("No project selected");
      }
      
      return await apiRequest("POST", "/api/ai/chat", { 
        message, 
        projectId: parseInt(projectId),
        model: selectedModel,
        context: {
          files: projectFiles.map(f => ({
            id: f.id,
            name: f.name,
            path: f.path,
            type: f.type,
            content: f.type === 'file' ? f.content?.substring(0, 1000) : null // First 1000 chars for context
          }))
        }
      });
    },
    onSuccess: (data: any) => {
      const aiMessage: Message = {
        id: Date.now().toString() + "-ai",
        content: data.message,
        sender: "ai",
        timestamp: new Date(),
        actions: data.actions || [],
        status: 'success'
      };
      
      setMessages(prev => [...prev, aiMessage]);
      
      // Execute AI actions
      if (data.actions && data.actions.length > 0) {
        executeAIActions(data.actions);
        
        toast({
          title: "AI Actions Executed",
          description: `AI performed ${data.actions.length} action(s) on your project`,
        });
      }
      
      // Scroll to bottom
      setTimeout(() => {
        scrollAreaRef.current?.scrollTo({ top: scrollAreaRef.current.scrollHeight, behavior: 'smooth' });
      }, 100);
    },
    onError: (error: any) => {
      const errorMessage: Message = {
        id: Date.now().toString() + "-error",
        content: `❌ Error: ${error.message || 'Failed to process your request'}`,
        sender: "ai",
        timestamp: new Date(),
        status: 'error'
      };
      
      setMessages(prev => [...prev, errorMessage]);
      
      toast({
        title: "AI Error",
        description: error.message || "Failed to send message to AI assistant",
        variant: "destructive",
      });
    },
  });

  // Execute AI actions (file operations, commands, etc.)
  const executeAIActions = async (actions: AIAction[]) => {
    for (const action of actions) {
      try {
        switch (action.type) {
          case 'create_file':
            await apiRequest('POST', `/api/projects/${projectId}/files`, {
              name: action.target.split('/').pop(),
              path: action.target,
              type: 'file',
              content: action.content || '',
              parentId: null
            });
            break;
            
          case 'update_file':
            const file = projectFiles.find(f => f.path === action.target || f.name === action.target);
            if (file) {
              await apiRequest('PUT', `/api/files/${file.id}`, {
                content: action.content
              });
            }
            break;
            
          case 'delete_file':
            const fileToDelete = projectFiles.find(f => f.path === action.target || f.name === action.target);
            if (fileToDelete) {
              await apiRequest('DELETE', `/api/files/${fileToDelete.id}`);
            }
            break;
            
          case 'run_command':
            if (onRunCommand) {
              onRunCommand(action.target);
            }
            break;
            
          case 'install_package':
            if (onRunCommand) {
              onRunCommand(`npm install ${action.target}`);
            }
            break;
        }
      } catch (error) {
        console.error(`Failed to execute action ${action.type}:`, error);
      }
    }
    
    // Refresh file tree after actions
    queryClient.invalidateQueries({ queryKey: ['project-files', parseInt(projectId!)] });
  };

  const handleSendMessage = () => {
    if (!inputValue.trim()) return;
    
    if (!projectId) {
      toast({
        title: "Error",
        description: "No project selected",
        variant: "destructive",
      });
      return;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      content: inputValue,
      sender: "user",
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    sendMessageMutation.mutate(inputValue);
    setInputValue("");
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleQuickAction = (action: string) => {
    setInputValue(action);
    handleSendMessage();
  };

  const quickActions = [
    "Create a React component",
    "Set up a Node.js API",
    "Add TypeScript to project",
    "Create a database schema",
    "Generate test files",
    "Fix any bugs in the code",
    "Optimize performance",
    "Add error handling"
  ];

  return (
    <div className="h-full flex flex-col bg-slate-800">
      {/* Header with Model Selection */}
      <div className="p-4 border-b border-slate-700">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <Bot className="w-5 h-5 text-blue-400" />
            <h3 className="text-sm font-medium text-gray-200">AI Assistant</h3>
            <Badge variant="secondary" className="text-xs">
              <Sparkles className="w-3 h-3 mr-1" />
              Pro
            </Badge>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-gray-400 hover:text-gray-200"
          >
            <Settings className="w-3 h-3" />
          </Button>
        </div>

        {/* Model Selection */}
        <div className="space-y-2">
          <label className="text-xs text-gray-400">AI Model</label>
          <Select value={selectedModel} onValueChange={setSelectedModel}>
            <SelectTrigger className="bg-slate-700 border-slate-600 text-gray-200">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AI_MODELS.map((model) => (
                <SelectItem key={model.id} value={model.id}>
                  <div className="flex items-center space-x-2">
                    {model.icon}
                    <div>
                      <div className="font-medium">{model.name}</div>
                      <div className="text-xs text-gray-500">{model.description}</div>
                    </div>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <TabsList className="grid w-full grid-cols-3 bg-slate-700">
          <TabsTrigger value="chat">Chat</TabsTrigger>
          <TabsTrigger value="actions">Quick Actions</TabsTrigger>
          <TabsTrigger value="context">Context</TabsTrigger>
        </TabsList>

        <TabsContent value="chat" className="flex-1 flex flex-col">
          {/* Chat messages */}
          <ScrollArea ref={scrollAreaRef} className="flex-1 p-4">
            <div className="space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex space-x-3 ${
                    message.sender === "user" ? "flex-row-reverse space-x-reverse" : ""
                  }`}
                >
                  <Avatar className="w-8 h-8 flex-shrink-0">
                    <AvatarFallback
                      className={
                        message.sender === "ai"
                          ? "bg-blue-500 text-white"
                          : "bg-green-500 text-black"
                      }
                    >
                      {message.sender === "ai" ? (
                        <Bot className="w-4 h-4" />
                      ) : (
                        <User className="w-4 h-4" />
                      )}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 max-w-md">
                    <div
                      className={`p-3 rounded-lg text-sm ${
                        message.sender === "ai"
                          ? message.status === 'error' 
                            ? "bg-red-900 text-red-200"
                            : "bg-slate-700 text-gray-200"
                          : "bg-blue-600 text-white"
                      }`}
                    >
                      <div className="whitespace-pre-wrap markdown-content">
                        {message.content}
                      </div>
                      
                      {/* AI Actions */}
                      {message.actions && message.actions.length > 0 && (
                        <div className="mt-3 space-y-2">
                          <div className="text-xs text-gray-400 font-medium">Actions Performed:</div>
                          {message.actions.map((action, idx) => (
                            <div key={idx} className="flex items-center space-x-2 text-xs">
                              {action.type === 'create_file' && <Plus className="w-3 h-3 text-green-400" />}
                              {action.type === 'update_file' && <Save className="w-3 h-3 text-blue-400" />}
                              {action.type === 'delete_file' && <Trash2 className="w-3 h-3 text-red-400" />}
                              {action.type === 'run_command' && <Terminal className="w-3 h-3 text-yellow-400" />}
                              <span className="text-gray-300">
                                {action.type.replace('_', ' ')} - {action.target}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 mt-1 flex items-center justify-between">
                      <span>
                        {message.timestamp.toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      {message.sender === "ai" && (
                        <Badge variant="outline" className="text-xs">
                          {selectedModel}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              
              {sendMessageMutation.isPending && (
                <div className="flex space-x-3">
                  <Avatar className="w-8 h-8 flex-shrink-0">
                    <AvatarFallback className="bg-blue-500 text-white">
                      <Bot className="w-4 h-4" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 max-w-md">
                    <div className="bg-slate-700 text-gray-200 p-3 rounded-lg text-sm">
                      <div className="flex items-center space-x-2">
                        <div className="flex space-x-1">
                          <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></div>
                          <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "0.1s" }}></div>
                          <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }}></div>
                        </div>
                        <span className="text-xs text-gray-400">AI is thinking...</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Chat input */}
          <div className="p-4 border-t border-slate-700">
            <div className="flex space-x-2">
              <Input
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask me to create files, run commands, fix bugs, or build features..."
                className="flex-1 bg-slate-900 border-slate-600 text-gray-200 placeholder-gray-400 focus:border-blue-500"
                disabled={sendMessageMutation.isPending}
              />
              <Button
                onClick={handleSendMessage}
                disabled={!inputValue.trim() || sendMessageMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700 text-white"
                size="sm"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="actions" className="flex-1 p-4">
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-gray-200 mb-3">Quick Actions</h4>
            <div className="grid grid-cols-1 gap-2">
              {quickActions.map((action, idx) => (
                <Button
                  key={idx}
                  variant="ghost"
                  className="justify-start text-left h-auto p-3 text-gray-300 hover:bg-slate-700"
                  onClick={() => handleQuickAction(action)}
                >
                  <div className="flex items-center space-x-2">
                    <Zap className="w-4 h-4 text-blue-400" />
                    <span>{action}</span>
                  </div>
                </Button>
              ))}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="context" className="flex-1 p-4">
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-gray-200">Project Context</h4>
            <div className="space-y-2">
              <div className="text-xs text-gray-400">
                Files: {projectFiles.length} | 
                Model: {AI_MODELS.find(m => m.id === selectedModel)?.name}
              </div>
              <div className="space-y-1">
                {projectFiles.slice(0, 10).map((file) => (
                  <div key={file.id} className="flex items-center space-x-2 text-xs">
                    <FileText className="w-3 h-3 text-gray-500" />
                    <span className="text-gray-300">{file.path || file.name}</span>
                  </div>
                ))}
                {projectFiles.length > 10 && (
                  <div className="text-xs text-gray-500">
                    ...and {projectFiles.length - 10} more files
                  </div>
                )}
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
