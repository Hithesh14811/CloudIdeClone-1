import { useEffect, useState, useRef, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { usePreview } from "@/hooks/usePreview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RefreshCw, ExternalLink, Play, Globe, Smartphone, Tablet, Monitor, Code, Eye, Settings, Maximize2, Minimize2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface PreviewPanelProps {
  projectId?: string;
}

type PreviewMode = 'web' | 'mobile' | 'tablet' | 'desktop';
type ViewMode = 'preview' | 'source' | 'split';

export default function PreviewPanel({ projectId }: PreviewPanelProps) {
  const { user } = useAuth();
  const { previewUrl, isLoading, isReady, startPreview, stopPreview, refreshPreview } = usePreview();
  const [refreshKey, setRefreshKey] = useState(0);
  const [previewMode, setPreviewMode] = useState<PreviewMode>('web');
  const [viewMode, setViewMode] = useState<ViewMode>('preview');
  const [isMaximized, setIsMaximized] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(1000);
  const [customUrl, setCustomUrl] = useState('');
  const [isCustomUrl, setIsCustomUrl] = useState(false);
  const [sourceCode, setSourceCode] = useState('');
  const [consoleOutput, setConsoleOutput] = useState<string[]>([]);
  
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const autoRefreshRef = useRef<NodeJS.Timeout>();
  const { toast } = useToast();

  useEffect(() => {
    // Start preview when component mounts and project is available
    if (projectId && user && !isReady && !isLoading) {
      startPreview(projectId, (user as any).id || "anonymous");
    }
  }, [projectId, user, isReady, isLoading, startPreview]);

  // Auto-refresh functionality
  useEffect(() => {
    if (autoRefresh && isReady && previewUrl) {
      autoRefreshRef.current = setInterval(() => {
        handleRefresh();
      }, refreshInterval);
    }

    return () => {
      if (autoRefreshRef.current) {
        clearInterval(autoRefreshRef.current);
      }
    };
  }, [autoRefresh, isReady, previewUrl, refreshInterval]);

  const handleRefresh = useCallback(() => {
    if (isReady) {
      refreshPreview();
    } else if (projectId && user) {
      startPreview(projectId, (user as any).id || "anonymous");
    }
    setRefreshKey(prev => prev + 1);
  }, [isReady, refreshPreview, projectId, user, startPreview]);

  const handleOpenInNewTab = useCallback(() => {
    const urlToOpen = isCustomUrl ? customUrl : previewUrl;
    if (urlToOpen) {
      window.open(urlToOpen, '_blank');
    }
  }, [previewUrl, customUrl, isCustomUrl]);

  const handleStartPreview = useCallback(async () => {
    if (projectId && user) {
      try {
        const response = await apiRequest('POST', `/api/projects/${projectId}/run`);
        if (response.previewUrl) {
          window.location.reload();
        }
      } catch (error) {
        console.error('Failed to start preview:', error);
        toast({
          title: "Preview Error",
          description: "Failed to start preview server",
          variant: "destructive"
        });
      }
    }
  }, [projectId, user, toast]);

  const handleCustomUrlSubmit = useCallback(() => {
    if (customUrl.trim()) {
      setIsCustomUrl(true);
      setRefreshKey(prev => prev + 1);
    }
  }, [customUrl]);

  const toggleMaximize = useCallback(() => {
    setIsMaximized(!isMaximized);
  }, [isMaximized]);

  const getPreviewDimensions = useCallback(() => {
    switch (previewMode) {
      case 'mobile':
        return { width: '375px', height: '667px' };
      case 'tablet':
        return { width: '768px', height: '1024px' };
      case 'desktop':
        return { width: '1200px', height: '800px' };
      default:
        return { width: '100%', height: '100%' };
    }
  }, [previewMode]);

  const handleIframeLoad = useCallback(() => {
    if (iframeRef.current) {
      try {
        // Inject console capture script
        const iframeDoc = iframeRef.current.contentDocument;
        if (iframeDoc) {
          const script = iframeDoc.createElement('script');
          script.textContent = `
            (function() {
              const originalLog = console.log;
              const originalError = console.error;
              const originalWarn = console.warn;
              
              console.log = function(...args) {
                originalLog.apply(console, args);
                window.parent.postMessage({
                  type: 'console',
                  level: 'log',
                  message: args.join(' ')
                }, '*');
              };
              
              console.error = function(...args) {
                originalError.apply(console, args);
                window.parent.postMessage({
                  type: 'console',
                  level: 'error',
                  message: args.join(' ')
                }, '*');
              };
              
              console.warn = function(...args) {
                originalWarn.apply(console, args);
                window.parent.postMessage({
                  type: 'console',
                  level: 'warn',
                  message: args.join(' ')
                }, '*');
              };
            })();
          `;
          iframeDoc.head.appendChild(script);
        }
      } catch (error) {
        // Cross-origin restrictions prevent console injection
        console.log('Console injection failed due to CORS');
      }
    }
  }, []);

  // Listen for console messages from iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'console') {
        setConsoleOutput(prev => [
          ...prev.slice(-49), // Keep last 49 messages
          `[${event.data.level.toUpperCase()}] ${event.data.message}`
        ]);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const currentUrl = isCustomUrl ? customUrl : previewUrl;
  const dimensions = getPreviewDimensions();

  return (
    <div className={`border-l border-slate-700 bg-slate-800 flex flex-col ${
      isMaximized ? 'fixed inset-0 z-50' : 'w-80'
    }`}>
      {/* Preview Header */}
      <div className="p-3 border-b border-slate-700 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-2">
            <h3 className="text-sm font-medium text-gray-200">Live Preview</h3>
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
              onClick={() => setShowSettings(!showSettings)}
              title="Preview Settings"
            >
              <Settings className="w-3 h-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-gray-400 hover:text-gray-200"
              onClick={toggleMaximize}
              title={isMaximized ? "Exit Fullscreen" : "Fullscreen"}
            >
              {isMaximized ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-gray-400 hover:text-gray-200"
              onClick={handleOpenInNewTab}
              title="Open in New Tab"
              disabled={!currentUrl}
            >
              <ExternalLink className="w-3 h-3" />
            </Button>
          </div>
        </div>
        
        {/* URL Bar */}
        <div className="flex items-center space-x-2 mb-2">
          <Globe className="w-3 h-3 text-gray-400 flex-shrink-0" />
          <Input
            value={isCustomUrl ? customUrl : (currentUrl || '')}
            onChange={(e) => setCustomUrl(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleCustomUrlSubmit()}
            className="text-xs bg-slate-700 border-slate-600 text-gray-300 h-6 px-2"
            placeholder="Enter custom URL or use project preview"
            title="Preview URL - Press Enter to load custom URL"
          />
          {customUrl && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-gray-400 hover:text-gray-200"
              onClick={() => {
                setIsCustomUrl(false);
                setCustomUrl('');
                setRefreshKey(prev => prev + 1);
              }}
            >
              Reset
            </Button>
          )}
        </div>

        {/* Device Mode Selector */}
        <div className="flex items-center space-x-1 mb-2">
          <Button
            variant={previewMode === 'web' ? 'default' : 'ghost'}
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => setPreviewMode('web')}
          >
            <Monitor className="w-3 h-3 mr-1" />
            Web
          </Button>
          <Button
            variant={previewMode === 'desktop' ? 'default' : 'ghost'}
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => setPreviewMode('desktop')}
          >
            <Monitor className="w-3 h-3 mr-1" />
            Desktop
          </Button>
          <Button
            variant={previewMode === 'tablet' ? 'default' : 'ghost'}
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => setPreviewMode('tablet')}
          >
            <Tablet className="w-3 h-3 mr-1" />
            Tablet
          </Button>
          <Button
            variant={previewMode === 'mobile' ? 'default' : 'ghost'}
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => setPreviewMode('mobile')}
          >
            <Smartphone className="w-3 h-3 mr-1" />
            Mobile
          </Button>
        </div>

        {/* View Mode Selector */}
        <div className="flex items-center space-x-1">
          <Button
            variant={viewMode === 'preview' ? 'default' : 'ghost'}
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => setViewMode('preview')}
          >
            <Eye className="w-3 h-3 mr-1" />
            Preview
          </Button>
          <Button
            variant={viewMode === 'source' ? 'default' : 'ghost'}
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => setViewMode('source')}
          >
            <Code className="w-3 h-3 mr-1" />
            Source
          </Button>
          <Button
            variant={viewMode === 'split' ? 'default' : 'ghost'}
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => setViewMode('split')}
          >
            Split
          </Button>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="bg-slate-800 border-b border-slate-700 p-4 shrink-0">
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <label className="text-gray-300">Auto Refresh</label>
              <button
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={`w-10 h-5 rounded-full transition-colors ${
                  autoRefresh ? 'bg-blue-600' : 'bg-slate-600'
                }`}
              >
                <div className={`w-4 h-4 rounded-full bg-white transition-transform ${
                  autoRefresh ? 'translate-x-5' : 'translate-x-0.5'
                }`} />
              </button>
            </div>
            {autoRefresh && (
              <div>
                <label className="block text-gray-300 mb-1">Refresh Interval (ms)</label>
                <select
                  value={refreshInterval}
                  onChange={(e) => setRefreshInterval(parseInt(e.target.value))}
                  className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-gray-200"
                >
                  <option value={500}>500ms</option>
                  <option value={1000}>1s</option>
                  <option value={2000}>2s</option>
                  <option value={5000}>5s</option>
                </select>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Preview Content */}
      <div className="flex-1 bg-white relative overflow-hidden">
        {currentUrl ? (
          <div className="h-full flex flex-col">
            {/* Preview */}
            {(viewMode === 'preview' || viewMode === 'split') && (
              <div className={`${viewMode === 'split' ? 'h-1/2' : 'h-full'} flex items-center justify-center bg-gray-100`}>
                <div 
                  className="bg-white shadow-lg border border-gray-300 overflow-hidden"
                  style={{
                    width: dimensions.width,
                    height: dimensions.height,
                    maxWidth: '100%',
                    maxHeight: '100%'
                  }}
                >
                  <iframe
                    ref={iframeRef}
                    src={`${currentUrl}?v=${refreshKey}`}
                    className="w-full h-full border-none"
                    title="Live Preview"
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                    onLoad={handleIframeLoad}
                    onError={() => console.log('Preview iframe error')}
                  />
                </div>
              </div>
            )}

            {/* Source/Console */}
            {(viewMode === 'source' || viewMode === 'split') && (
              <div className={`${viewMode === 'split' ? 'h-1/2 border-t border-slate-700' : 'h-full'} bg-slate-900 overflow-auto`}>
                <div className="p-4">
                  <div className="text-xs text-gray-400 mb-2">Console Output:</div>
                  <div className="bg-black rounded p-2 font-mono text-xs max-h-40 overflow-y-auto">
                    {consoleOutput.length > 0 ? (
                      consoleOutput.map((output, index) => (
                        <div key={index} className={`${
                          output.includes('[ERROR]') ? 'text-red-400' :
                          output.includes('[WARN]') ? 'text-yellow-400' :
                          'text-green-400'
                        }`}>
                          {output}
                        </div>
                      ))
                    ) : (
                      <div className="text-gray-500">No console output</div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-gray-600">
              <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p>Starting preview server...</p>
              <p className="text-xs text-gray-500 mt-2">Hot reload enabled • Multi-device testing</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-gray-600">
              <div className="mb-4">
                <Play className="w-16 h-16 mx-auto text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-700 mb-2">Live Preview</h3>
              <p className="text-sm text-gray-500 mb-4">
                VS Code-level live preview with hot reload and responsive testing
              </p>
              <div className="text-xs text-gray-600 mb-4">
                <p>🔥 <strong>Features:</strong></p>
                <p>• Hot reload on file changes</p>
                <p>• Multi-device responsive testing</p>
                <p>• Console output capture</p>
                <p>• Custom URL support</p>
                <p>• Split view (Preview + Console)</p>
              </div>
              <Button
                onClick={handleStartPreview}
                className="bg-blue-600 hover:bg-blue-700 text-white"
                disabled={!projectId}
              >
                <Play className="w-4 h-4 mr-2" />
                Start Live Preview
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Status Bar */}
      <div className="bg-slate-800 border-t border-slate-700 px-4 py-1 text-xs text-gray-500 shrink-0">
        <div className="flex items-center justify-between">
          <span>
            {previewMode.charAt(0).toUpperCase() + previewMode.slice(1)} • {viewMode}
            {autoRefresh && ` • Auto-refresh: ${refreshInterval}ms`}
          </span>
          <span className="text-gray-400">
            {currentUrl ? '●' : '○'} {isReady ? 'Live' : 'Stopped'}
          </span>
        </div>
      </div>
    </div>
  );
}