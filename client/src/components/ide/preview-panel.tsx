import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { usePreview } from "@/hooks/usePreview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RefreshCw, ExternalLink, Play, Globe } from "lucide-react";

interface PreviewPanelProps {
  projectId?: string;
}

export default function PreviewPanel({ projectId }: PreviewPanelProps) {
  const { user } = useAuth();
  const { previewUrl, isLoading, isReady, startPreview, stopPreview, refreshPreview } = usePreview();
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    // Start preview when component mounts and project is available
    if (projectId && user && !isReady && !isLoading) {
      startPreview(projectId, (user as any).id || "anonymous");
    }
  }, [projectId, user, isReady, isLoading, startPreview]);

  const handleRefresh = () => {
    if (isReady) {
      refreshPreview();
    } else if (projectId && user) {
      startPreview(projectId, (user as any).id || "anonymous");
    }
    setRefreshKey(prev => prev + 1);
  };

  const handleOpenInNewTab = () => {
    if (previewUrl) {
      window.open(previewUrl, '_blank');
    }
  };

  const handleStartPreview = () => {
    if (projectId && user) {
      startPreview(projectId, (user as any).id || "anonymous");
    }
  };

  return (
    <div className="w-80 border-l border-slate-700 bg-slate-800 flex flex-col">
      <div className="p-3 border-b border-slate-700">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-2">
            <h3 className="text-sm font-medium text-gray-200">Preview</h3>
            <div className={`w-2 h-2 rounded-full ${isReady ? 'bg-green-400' : isLoading ? 'bg-yellow-400' : 'bg-red-400'}`} 
                 title={isReady ? 'Preview Ready' : isLoading ? 'Starting Preview' : 'Preview Stopped'} />
          </div>
          <div className="flex items-center space-x-1">
            {!isReady && !isLoading && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-gray-400 hover:text-gray-200"
                onClick={handleStartPreview}
                title="Start Preview"
              >
                <Play className="w-3 h-3" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-gray-400 hover:text-gray-200"
              onClick={handleRefresh}
              title="Refresh Preview"
              disabled={isLoading}
            >
              <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-gray-400 hover:text-gray-200"
              onClick={handleOpenInNewTab}
              title="Open in New Tab"
              disabled={!previewUrl}
            >
              <ExternalLink className="w-3 h-3" />
            </Button>
          </div>
        </div>
        
        {/* URL Bar */}
        {previewUrl && (
          <div className="flex items-center space-x-2 mt-2">
            <Globe className="w-3 h-3 text-gray-400 flex-shrink-0" />
            <Input
              value={previewUrl}
              readOnly
              className="text-xs bg-slate-700 border-slate-600 text-gray-300 h-6 px-2 cursor-text select-all"
              onClick={(e) => (e.target as HTMLInputElement).select()}
              title="Preview URL - Click to select all"
            />
          </div>
        )}
      </div>
      
      <div className="flex-1 bg-white">
        {previewUrl ? (
          <iframe
            src={`${previewUrl}?v=${refreshKey}`}
            className="w-full h-full border-none"
            title="Live Preview"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            onError={() => console.log('Preview iframe error')}
            onLoad={() => console.log('Preview iframe loaded successfully')}
          />
        ) : isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-gray-600">
              <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p>Starting preview server...</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-gray-600">
              <div className="mb-4">
                <Play className="w-16 h-16 mx-auto text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-700 mb-2">Preview Not Started</h3>
              <p className="text-sm text-gray-500 mb-4">
                Click the play button to start live preview of your project
              </p>
              <Button
                onClick={handleStartPreview}
                className="bg-blue-600 hover:bg-blue-700 text-white"
                disabled={!projectId}
              >
                <Play className="w-4 h-4 mr-2" />
                Start Preview
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}