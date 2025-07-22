import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";

import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Code, Play, Bot, Menu, Circle } from "lucide-react";

interface TopNavBarProps {
  projectName?: string;
}

export default function TopNavBar({ projectName }: TopNavBarProps) {
  const { user } = useAuth();
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "error">("saved");

  const handleSave = async () => {
    setSaveStatus("saving");
    // Mock save for now
    setTimeout(() => setSaveStatus("saved"), 1000);
  };

  const handleRun = () => {
    // Mock run functionality
    console.log('Running project...');
  };

  const getUserInitials = () => {
    const userData = user as any;
    if (userData?.firstName && userData?.lastName) {
      return `${userData.firstName[0]}${userData.lastName[0]}`.toUpperCase();
    }
    return userData?.email?.[0]?.toUpperCase() || "U";
  };

  return (
    <div className="bg-slate-700 border-b border-slate-600 px-4 py-2 flex items-center justify-between">
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-blue-500 rounded flex items-center justify-center">
            <Code className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold text-gray-200">
            {projectName || "Shetty"}
          </span>
        </div>
        
        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-1 text-gray-400 text-xs">
            <Circle 
              className={`w-1.5 h-1.5 ${
                saveStatus === "saved" ? "text-green-400 fill-current" :
                saveStatus === "saving" ? "text-yellow-400 fill-current" :
                "text-red-400 fill-current"
              }`} 
            />
            <span>
              {saveStatus === "saved" ? "Saved" :
               saveStatus === "saving" ? "Saving..." :
               "Error"}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center space-x-2">
        <Button 
          onClick={handleSave}
          variant="ghost"
          size="sm"
          className="text-gray-400 hover:text-gray-200 hover:bg-slate-600"
        >
          Save
        </Button>
        
        <Button 
          onClick={handleRun}
          className="bg-green-600 hover:bg-green-700 text-black font-medium"
          size="sm"
        >
          <Play className="w-4 h-4 mr-1" />
          Run
        </Button>
        
        <Button 
          variant="outline"
          className="bg-blue-600 hover:bg-blue-700 text-white border-blue-500"
          size="sm"
        >
          <Bot className="w-4 h-4 mr-1" />
          AI Assistant
        </Button>

        <div className="flex items-center space-x-2 ml-4">
          <Avatar className="w-7 h-7">
            <AvatarImage src={(user as any)?.profileImageUrl || ""} />
            <AvatarFallback className="bg-blue-500 text-white text-xs">
              {getUserInitials()}
            </AvatarFallback>
          </Avatar>
          <span className="text-sm text-gray-400">
            {(user as any)?.firstName || (user as any)?.email}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="text-gray-400 hover:text-gray-200"
            onClick={() => window.location.href = "/api/logout"}
          >
            Logout
          </Button>
        </div>
      </div>
    </div>
  );
}
