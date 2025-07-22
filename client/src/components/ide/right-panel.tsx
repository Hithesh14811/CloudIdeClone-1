import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Eye, Bot } from "lucide-react";
import PreviewPanel from "./preview-panel";
import AIAssistant from "./ai-assistant";

interface RightPanelProps {
  projectId?: string;
}

export default function RightPanel({ projectId }: RightPanelProps) {
  return (
    <div className="w-96 bg-slate-800 border-l border-slate-700 flex flex-col">
      <Tabs defaultValue="preview" className="h-full">
        <TabsList className="bg-slate-700 border-b border-slate-600 w-full rounded-none h-10">
          <TabsTrigger 
            value="preview" 
            className="flex-1 data-[state=active]:bg-slate-600 data-[state=active]:text-gray-200"
          >
            <Eye className="w-4 h-4 mr-2" />
            Preview
          </TabsTrigger>
          <TabsTrigger 
            value="assistant" 
            className="flex-1 data-[state=active]:bg-slate-600 data-[state=active]:text-gray-200"
          >
            <Bot className="w-4 h-4 mr-2" />
            AI Assistant
          </TabsTrigger>
        </TabsList>

        <TabsContent value="preview" className="flex-1 mt-0">
          <PreviewPanel projectId={projectId} />
        </TabsContent>

        <TabsContent value="assistant" className="flex-1 mt-0">
          <AIAssistant projectId={projectId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
