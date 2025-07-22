import { useEffect, useState } from "react";
import { useIDE } from "@/hooks/useIDE";
import { Button } from "@/components/ui/button";
import { RefreshCw, ExternalLink } from "lucide-react";

export default function PreviewPanel() {
  const { currentProject } = useIDE();
  const [previewContent, setPreviewContent] = useState<string>("");

  // Mock preview content generation
  useEffect(() => {
    if (currentProject) {
      // Generate mock preview HTML
      const mockHtml = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${currentProject.name}</title>
            <style>
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    max-width: 600px;
                    margin: 40px auto;
                    padding: 20px;
                    line-height: 1.6;
                    color: #333;
                }
                .header {
                    text-align: center;
                    margin-bottom: 40px;
                }
                .project-title {
                    color: #2563eb;
                    margin-bottom: 10px;
                }
                .card {
                    background: #f8fafc;
                    border: 1px solid #e2e8f0;
                    border-radius: 8px;
                    padding: 20px;
                    margin: 20px 0;
                }
                .button {
                    background: #3b82f6;
                    color: white;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 14px;
                }
                .button:hover {
                    background: #2563eb;
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h1 class="project-title">${currentProject.name}</h1>
                <p>Welcome to your project preview!</p>
            </div>
            
            <div class="card">
                <h3>🚀 Project Status</h3>
                <p>Your project is running and ready for development.</p>
                <button class="button" onclick="alert('Hello from ${currentProject.name}!')">
                    Click me!
                </button>
            </div>
            
            <div class="card">
                <h3>📁 Files</h3>
                <p>Use the file explorer to manage your project files.</p>
                <ul>
                    <li>index.html - Main HTML file</li>
                    <li>script.js - JavaScript functionality</li>
                    <li>style.css - Styling</li>
                </ul>
            </div>
            
            <div class="card">
                <h3>🤖 AI Assistant</h3>
                <p>Need help? Use the AI Assistant tab to get coding help and suggestions.</p>
            </div>
        </body>
        </html>
      `;
      setPreviewContent(mockHtml);
    }
  }, [currentProject]);

  const handleRefresh = () => {
    // Force re-render of preview
    const iframe = document.getElementById('preview-iframe') as HTMLIFrameElement;
    if (iframe) {
      iframe.src = iframe.src;
    }
  };

  if (!currentProject) {
    return (
      <div className="h-full flex items-center justify-center bg-white">
        <div className="text-center text-gray-500">
          <p>No project selected</p>
          <p className="text-sm mt-2">Select a project to see the preview</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Browser-like header */}
      <div className="bg-gray-100 border-b px-4 py-2 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-red-500 rounded-full"></div>
          <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
          <div className="w-3 h-3 bg-green-500 rounded-full"></div>
        </div>
        <div className="text-xs text-gray-600 bg-white px-3 py-1 rounded border">
          localhost:3000
        </div>
        <div className="flex space-x-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-gray-500 hover:text-gray-700"
            onClick={handleRefresh}
            title="Refresh Preview"
          >
            <RefreshCw className="w-3 h-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-gray-500 hover:text-gray-700"
            title="Open in New Tab"
          >
            <ExternalLink className="w-3 h-3" />
          </Button>
        </div>
      </div>
      
      {/* Preview content */}
      <div className="flex-1">
        <iframe
          id="preview-iframe"
          srcDoc={previewContent}
          className="w-full h-full border-none"
          title="Project Preview"
          sandbox="allow-scripts allow-same-origin"
        />
      </div>
    </div>
  );
}
