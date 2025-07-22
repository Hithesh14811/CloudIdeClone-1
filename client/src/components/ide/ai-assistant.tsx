import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Bot, User, Send } from "lucide-react";

interface Message {
  id: string;
  content: string;
  sender: "user" | "ai";
  timestamp: Date;
}

interface AIAssistantProps {
  projectId?: string;
}

export default function AIAssistant({ projectId }: AIAssistantProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      content: "Hello! I'm your AI coding assistant for Shetty IDE. I can help you build, debug, and improve your code. What would you like to work on today?",
      sender: "ai",
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState("");

  const sendMessageMutation = useMutation({
    mutationFn: async (message: string) => {
      if (!projectId) {
        throw new Error("No project selected");
      }
      return await apiRequest("POST", "/api/ai/chat", { 
        message, 
        projectId: parseInt(projectId)
      });
    },
    onSuccess: (data: any) => {
      const aiMessage: Message = {
        id: Date.now().toString() + "-ai",
        content: data.message,
        sender: "ai",
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, aiMessage]);
      
      // If AI performed actions (created/modified files), refresh the file tree
      if (data.actions && data.actions.length > 0) {
        // Invalidate project files to refresh the file tree
        queryClient.invalidateQueries({ queryKey: ['project-files', parseInt(projectId!)] });
        
        toast({
          title: "Files Updated",
          description: `AI modified ${data.actions.length} file(s) in your project`,
        });
      }
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to send message to AI assistant",
        variant: "destructive",
      });
    },
  });

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

  return (
    <div className="h-full flex flex-col bg-slate-800">
      {/* Chat messages */}
      <ScrollArea className="flex-1 p-4">
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
              <div className="flex-1 max-w-xs">
                <div
                  className={`p-3 rounded-lg text-sm ${
                    message.sender === "ai"
                      ? "bg-slate-700 text-gray-200"
                      : "bg-blue-600 text-white"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{message.content}</p>
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {message.timestamp.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
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
              <div className="flex-1 max-w-xs">
                <div className="bg-slate-700 text-gray-200 p-3 rounded-lg text-sm">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0.1s" }}></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }}></div>
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
            placeholder="Ask the AI assistant..."
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
    </div>
  );
}
