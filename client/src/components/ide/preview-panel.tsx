import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw, ExternalLink } from "lucide-react";

export default function PreviewPanel() {
  const [previewContent, setPreviewContent] = useState<string>("");
  const [refreshKey, setRefreshKey] = useState(0);

  // Generate mock preview content
  useEffect(() => {
    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Preview</title>
    <style>
      body { 
        font-family: system-ui; 
        padding: 2rem; 
        background: #1e293b; 
        color: white;
        margin: 0;
      }
      .container { 
        text-align: center; 
        margin-top: 4rem; 
      }
      h1 { 
        color: #3b82f6; 
        margin-bottom: 1rem; 
      }
      p { 
        color: #94a3b8; 
        line-height: 1.6; 
      }
    </style>
</head>
<body>
    <div class="container">
        <h1>Live Preview</h1>
        <p>Your project preview will appear here.</p>
        <p>Create HTML files and they will be rendered in this panel.</p>
    </div>
</body>
</html>`;
    
    setPreviewContent(htmlContent);
  }, [refreshKey]);

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1);
  };

  const handleOpenInNewTab = () => {
    const newWindow = window.open();
    if (newWindow) {
      newWindow.document.write(previewContent);
      newWindow.document.close();
    }
  };

  return (
    <div className="w-80 border-l border-slate-700 bg-slate-800 flex flex-col">
      <div className="p-3 border-b border-slate-700 flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-200">Preview</h3>
        <div className="flex items-center space-x-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-gray-400 hover:text-gray-200"
            onClick={handleRefresh}
            title="Refresh Preview"
          >
            <RefreshCw className="w-3 h-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-gray-400 hover:text-gray-200"
            onClick={handleOpenInNewTab}
            title="Open in New Tab"
          >
            <ExternalLink className="w-3 h-3" />
          </Button>
        </div>
      </div>
      
      <div className="flex-1 bg-white">
        <iframe
          srcDoc={previewContent}
          className="w-full h-full border-none"
          title="Preview"
          sandbox="allow-scripts allow-same-origin"
        />
      </div>
    </div>
  );
}