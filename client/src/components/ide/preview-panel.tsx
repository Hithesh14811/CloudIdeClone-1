import { useEffect, useState } from "react";
import { useIDE } from "@/hooks/useIDE";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { RefreshCw, ExternalLink } from "lucide-react";
import type { File as FileType } from "@shared/schema";

export default function PreviewPanel() {
  const { currentProject } = useIDE();
  const [previewContent, setPreviewContent] = useState<string>("");
  const [refreshKey, setRefreshKey] = useState(0);

  // Fetch project files
  const { data: files } = useQuery({
    queryKey: ["/api/projects", currentProject?.id, "files"],
    enabled: !!currentProject,
  });

  // Generate actual preview content from project files
  useEffect(() => {
    if (currentProject && files) {
      const fileArray = files as FileType[];
      
      // Find main HTML file (index.html or first .html file)
      const htmlFile = fileArray.find(f => !f.isFolder && (f.name === "index.html" || f.name.endsWith('.html'))) ||
                       fileArray.find(f => !f.isFolder && f.name.endsWith('.html'));
      
      // Find CSS files
      const cssFiles = fileArray.filter(f => !f.isFolder && f.name.endsWith('.css'));
      
      // Find JS files  
      const jsFiles = fileArray.filter(f => !f.isFolder && f.name.endsWith('.js'));

      if (htmlFile && htmlFile.content) {
        let htmlContent = htmlFile.content;
        
        // Inject CSS content inline
        cssFiles.forEach(cssFile => {
          if (cssFile.content) {
            const cssTag = `<style>/* ${cssFile.name} */\n${cssFile.content}</style>`;
            // Insert CSS in head or before closing head tag
            if (htmlContent.includes('</head>')) {
              htmlContent = htmlContent.replace('</head>', `${cssTag}\n</head>`);
            } else if (htmlContent.includes('<head>')) {
              htmlContent = htmlContent.replace('<head>', `<head>\n${cssTag}`);
            } else {
              htmlContent = `<style>${cssFile.content}</style>\n${htmlContent}`;
            }
          }
        });
        
        // Inject JS content inline
        jsFiles.forEach(jsFile => {
          if (jsFile.content) {
            const jsTag = `<script>/* ${jsFile.name} */\n${jsFile.content}</script>`;
            // Insert JS before closing body tag or at end
            if (htmlContent.includes('</body>')) {
              htmlContent = htmlContent.replace('</body>', `${jsTag}\n</body>`);
            } else {
              htmlContent = `${htmlContent}\n${jsTag}`;
            }
          }
        });
        
        setPreviewContent(htmlContent);
      } else {
        // Fallback: Generate a preview from available files
        const fallbackHtml = `
          <!DOCTYPE html>
          <html lang="en">
          <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>${currentProject.name}</title>
              <style>
                  body {
                      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                      max-width: 800px;
                      margin: 40px auto;
                      padding: 20px;
                      line-height: 1.6;
                      background: #f8fafc;
                  }
                  .header { text-align: center; margin-bottom: 40px; }
                  .card { background: white; border-radius: 8px; padding: 20px; margin: 20px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
                  .file-list { list-style: none; padding: 0; }
                  .file-item { padding: 8px; border-left: 4px solid #3b82f6; margin: 4px 0; background: #f1f5f9; }
              </style>
          </head>
          <body>
              <div class="header">
                  <h1>${currentProject.name}</h1>
                  <p>Project Preview</p>
              </div>
              
              <div class="card">
                  <h3>📁 Project Files</h3>
                  <ul class="file-list">
                      ${fileArray.map(file => 
                        `<li class="file-item">${file.isFolder ? '📁' : '📄'} ${file.name}</li>`
                      ).join('')}
                  </ul>
              </div>
              
              <div class="card">
                  <h3>🚀 Getting Started</h3>
                  <p>Create an <strong>index.html</strong> file to see your web page preview here!</p>
              </div>
          </body>
          </html>
        `;
        setPreviewContent(fallbackHtml);
      }
    }
  }, [currentProject, files, refreshKey]);

  const handleRefresh = () => {
    // Force re-render of preview by updating refresh key
    setRefreshKey(prev => prev + 1);
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
