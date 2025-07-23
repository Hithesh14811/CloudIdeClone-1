import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { insertProjectSchema, insertFileSchema } from "@shared/schema";
import { z } from "zod";
import { processAIRequest } from "./services/aiAgent";
import { updatePreviewFiles } from "./services/preview";
import { getFileSyncForProject } from "./sockets/terminal";
import { Server as SocketIOServer } from 'socket.io';
import {
  strictRateLimit,
  aiRateLimit,
  validateProjectId,
  validateFileId,
  validateCreateProject,
  validateCreateFile,
  validateUpdateFile,
  validateAiChat,
  validatePagination,
  handleValidationErrors,
  validateUserQuotas
} from './middleware/security';

// Global variable to store the Socket.IO instance for real-time updates
let globalIO: SocketIOServer | null = null;

export function setGlobalIO(io: SocketIOServer) {
  globalIO = io;
}

function emitFileUpdate(projectId: number, eventType: string) {
  if (globalIO) {
    const projectRoom = `project-${projectId}`;
    globalIO.to(projectRoom).emit('files:updated', {
      projectId: projectId.toString(),
      eventType,
      timestamp: Date.now()
    });
    console.log(`Emitted ${eventType} event to room ${projectRoom}`);
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup authentication middleware
  await setupAuth(app);

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ 
          error: "User not found",
          code: "USER_NOT_FOUND"
        });
      }
      
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ 
        error: "Failed to fetch user",
        code: "USER_FETCH_ERROR"
      });
    }
  });

  // Project routes with validation and rate limiting
  app.get("/api/projects", 
    isAuthenticated,
    validatePagination,
    handleValidationErrors,
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const offset = (page - 1) * limit;
        
        const projects = await storage.getUserProjects(userId, { limit, offset });
        
        // Get user stats for additional context
        const stats = await storage.getUserStats(userId);
        
        res.json({
          projects,
          pagination: {
            page,
            limit,
            total: stats.projectCount
          },
          stats: {
            projectCount: stats.projectCount,
            fileCount: stats.fileCount,
            totalSize: stats.totalSize
          }
        });
      } catch (error) {
        console.error("Error fetching projects:", error);
        res.status(500).json({ 
          error: "Failed to fetch projects",
          code: "PROJECTS_FETCH_ERROR"
        });
      }
    }
  );

  app.post("/api/projects", 
    isAuthenticated,
    strictRateLimit, // Stricter rate limiting for project creation
    validateUserQuotas,
    validateCreateProject,
    handleValidationErrors,
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const projectData = insertProjectSchema.parse({
          ...req.body,
          userId,
        });

        const project = await storage.createProject(projectData);

        // Create default files for new project with better error handling
        try {
          const defaultFiles = [
            {
              name: "index.html",
              path: "/index.html",
              content: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${project.name}</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <div class="container">
        <h1>Welcome to ${project.name}</h1>
        <p>Start building your amazing project!</p>
        <button onclick="showMessage()">Click me!</button>
    </div>
    <script src="script.js"></script>
</body>
</html>`,
              isFolder: false,
              projectId: project.id,
            },
            {
              name: "script.js",
              path: "/script.js",
              content: `// Welcome to your new project!
console.log('Hello from Shetty IDE!');

function showMessage() {
    alert('Hello from ${project.name}!');
}

// Add your JavaScript code here
`,
              isFolder: false,
              projectId: project.id,
            },
            {
              name: "style.css",
              path: "/style.css",
              content: `/* Styles for ${project.name} */
* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    line-height: 1.6;
    color: #333;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
}

.container {
    background: white;
    padding: 2rem;
    border-radius: 10px;
    box-shadow: 0 10px 25px rgba(0,0,0,0.1);
    text-align: center;
    max-width: 500px;
    width: 90%;
}

h1 {
    color: #2c3e50;
    margin-bottom: 1rem;
}

p {
    color: #666;
    margin-bottom: 2rem;
}

button {
    background: #667eea;
    color: white;
    border: none;
    padding: 12px 24px;
    border-radius: 5px;
    cursor: pointer;
    font-size: 16px;
    transition: background 0.3s ease;
}

button:hover {
    background: #5a6fd8;
}
`,
              isFolder: false,
              projectId: project.id,
            }
          ];

          await storage.createFilesBatch(defaultFiles);
        } catch (fileError) {
          console.error("Error creating default files:", fileError);
          // Don't fail the project creation if default files fail
        }

        res.status(201).json(project);
      } catch (error) {
        console.error("Error creating project:", error);
        
        if (error instanceof Error && error.message.includes('Maximum project limit')) {
          return res.status(429).json({ 
            error: error.message,
            code: "PROJECT_LIMIT_EXCEEDED"
          });
        }
        
        res.status(500).json({ 
          error: "Failed to create project",
          code: "PROJECT_CREATE_ERROR"
        });
      }
    }
  );

  app.delete("/api/projects/:id", 
    isAuthenticated,
    strictRateLimit,
    validateProjectId,
    handleValidationErrors,
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const projectId = parseInt(req.params.id);

        const project = await storage.getProject(projectId);
        if (!project || project.userId !== userId) {
          return res.status(404).json({ 
            error: "Project not found",
            code: "PROJECT_NOT_FOUND"
          });
        }

        await storage.deleteProject(projectId);
        
        // Emit deletion event
        emitFileUpdate(projectId, 'project_deleted');
        
        res.json({ 
          message: "Project deleted successfully",
          projectId 
        });
      } catch (error) {
        console.error("Error deleting project:", error);
        res.status(500).json({ 
          error: "Failed to delete project",
          code: "PROJECT_DELETE_ERROR"
        });
      }
    }
  );

  app.get("/api/projects/:id", 
    isAuthenticated,
    validateProjectId,
    handleValidationErrors,
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const projectId = parseInt(req.params.id);

        const project = await storage.getProject(projectId);
        if (!project || project.userId !== userId) {
          return res.status(404).json({ 
            error: "Project not found",
            code: "PROJECT_NOT_FOUND"
          });
        }

        res.json(project);
      } catch (error) {
        console.error("Error fetching project:", error);
        res.status(500).json({ 
          error: "Failed to fetch project",
          code: "PROJECT_FETCH_ERROR"
        });
      }
    }
  );

  // File routes with enhanced validation
  app.get("/api/projects/:projectId/files", 
    isAuthenticated,
    validateProjectId,
    handleValidationErrors,
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const projectId = parseInt(req.params.projectId);

        // Verify project ownership
        const project = await storage.getProject(projectId);
        if (!project || project.userId !== userId) {
          return res.status(404).json({ 
            error: "Project not found",
            code: "PROJECT_NOT_FOUND"
          });
        }

        const files = await storage.getProjectFiles(projectId);
        res.json(files);
      } catch (error) {
        console.error("Error fetching files:", error);
        res.status(500).json({ 
          error: "Failed to fetch files",
          code: "FILES_FETCH_ERROR"
        });
      }
    }
  );

  app.post("/api/projects/:projectId/files", 
    isAuthenticated,
    validateUserQuotas,
    validateProjectId,
    validateCreateFile,
    handleValidationErrors,
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const projectId = parseInt(req.params.projectId);

        // Verify project ownership
        const project = await storage.getProject(projectId);
        if (!project || project.userId !== userId) {
          return res.status(404).json({ 
            error: "Project not found",
            code: "PROJECT_NOT_FOUND"
          });
        }

        const fileData = insertFileSchema.parse({
          ...req.body,
          projectId,
        });

        const file = await storage.createFile(fileData);

        // Emit real-time event for file creation
        emitFileUpdate(projectId, 'create');

        res.status(201).json(file);
      } catch (error) {
        console.error("Error creating file:", error);
        
        if (error instanceof Error) {
          if (error.message.includes('Maximum file limit')) {
            return res.status(429).json({ 
              error: error.message,
              code: "FILE_LIMIT_EXCEEDED"
            });
          }
          if (error.message.includes('File already exists')) {
            return res.status(409).json({ 
              error: error.message,
              code: "FILE_ALREADY_EXISTS"
            });
          }
        }
        
        res.status(500).json({ 
          error: "Failed to create file",
          code: "FILE_CREATE_ERROR"
        });
      }
    }
  );

  app.put("/api/files/:id", 
    isAuthenticated,
    validateFileId,
    validateUpdateFile,
    handleValidationErrors,
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const fileId = parseInt(req.params.id);

        // Verify file ownership through project
        const file = await storage.getFile(fileId);
        if (!file) {
          return res.status(404).json({ 
            error: "File not found",
            code: "FILE_NOT_FOUND"
          });
        }

        const project = await storage.getProject(file.projectId);
        if (!project || project.userId !== userId) {
          return res.status(404).json({ 
            error: "File not found",
            code: "FILE_NOT_FOUND"
          });
        }

        const updates = z.object({
          content: z.string().optional(),
          name: z.string().optional(),
        }).parse(req.body);

        const updatedFile = await storage.updateFile(fileId, updates);

        // Emit real-time event for file update
        emitFileUpdate(file.projectId, 'update');

        res.json(updatedFile);
      } catch (error) {
        console.error("Error updating file:", error);
        res.status(500).json({ 
          error: "Failed to update file",
          code: "FILE_UPDATE_ERROR"
        });
      }
    }
  );

  app.delete("/api/files/:id", 
    isAuthenticated,
    strictRateLimit,
    validateFileId,
    handleValidationErrors,
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const fileId = parseInt(req.params.id);

        // Verify file ownership through project
        const file = await storage.getFile(fileId);
        if (!file) {
          return res.status(404).json({ 
            error: "File not found",
            code: "FILE_NOT_FOUND"
          });
        }

        const project = await storage.getProject(file.projectId);
        if (!project || project.userId !== userId) {
          return res.status(404).json({ 
            error: "File not found",
            code: "FILE_NOT_FOUND"
          });
        }

        // Delete from database first
        await storage.deleteFile(fileId);

        // Mark file as recently deleted in FileSync to prevent re-sync
        const fileSync = getFileSyncForProject(file.projectId.toString(), userId);
        if (fileSync) {
          fileSync.markAsDeleted(file.path);
          console.log(`Marked file as deleted: ${file.path}`);
        }

        // Also delete from filesystem workspace
        try {
          const fs = await import('fs');
          const path = await import('path');
          const { tmpdir } = await import('os');
          const workspaceDir = path.join(tmpdir(), 'shetty-workspace', userId, file.projectId.toString());
          const fullFilePath = path.join(workspaceDir, file.path);

          if (fs.existsSync(fullFilePath)) {
            const stats = fs.lstatSync(fullFilePath);
            if (stats.isDirectory()) {
              // Delete directory recursively
              fs.rmSync(fullFilePath, { recursive: true, force: true });
              console.log(`Deleted directory from filesystem: ${fullFilePath}`);
            } else {
              // Delete file
              fs.unlinkSync(fullFilePath);
              console.log(`Deleted file from filesystem: ${fullFilePath}`);
            }
          }
        } catch (fsError) {
          console.error(`Error deleting from filesystem: ${fsError}`);
          // Don't fail the API call if filesystem deletion fails
        }

        // Emit real-time event for file deletion
        emitFileUpdate(file.projectId, 'delete');

        res.json({ 
          message: "File deleted successfully",
          fileId 
        });
      } catch (error) {
        console.error("Error deleting file:", error);
        res.status(500).json({ 
          error: "Failed to delete file",
          code: "FILE_DELETE_ERROR"
        });
      }
    }
  );

  // AI Assistant routes with enhanced security
  app.post("/api/ai/chat", 
    isAuthenticated,
    aiRateLimit,
    validateAiChat,
    handleValidationErrors,
    async (req, res) => {
      try {
        const { message, projectId } = req.body;
        const userId = (req as any).user.claims.sub;

        // Verify project ownership
        const project = await storage.getProject(parseInt(projectId));
        if (!project || project.userId !== userId) {
          return res.status(404).json({ 
            error: "Project not found",
            code: "PROJECT_NOT_FOUND"
          });
        }

        // Use the AI service to process the request and potentially modify files
        const aiResponse = await processAIRequest(message, parseInt(projectId), userId);

        // If files were modified, trigger preview update
        if (aiResponse.actions && aiResponse.actions.length > 0) {
          // Update preview if there's an active session
          updatePreviewFiles(projectId, userId).catch(console.error);
          
          // Emit file update event
          emitFileUpdate(parseInt(projectId), 'ai_update');
        }

        res.json({
          message: aiResponse.message,
          actions: aiResponse.actions,
          success: aiResponse.success,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error("Error in AI chat:", error);
        res.status(500).json({ 
          error: "Failed to process AI request",
          code: "AI_REQUEST_ERROR"
        });
      }
    }
  );

  // Project execution routes with validation
  app.post("/api/projects/:id/run", 
    isAuthenticated,
    strictRateLimit,
    validateProjectId,
    handleValidationErrors,
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const projectId = parseInt(req.params.id);

        // Verify project ownership
        const project = await storage.getProject(projectId);
        if (!project || project.userId !== userId) {
          return res.status(404).json({ 
            error: "Project not found",
            code: "PROJECT_NOT_FOUND"
          });
        }

        // Start preview session
        const { previewService } = await import("./services/preview");
        const session = await previewService.createPreviewSession(
          projectId.toString(), 
          userId
        );

        res.json({
          message: "Project execution started",
          projectId,
          previewUrl: session.previewUrl,
          sessionId: session.id,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error("Error running project:", error);
        res.status(500).json({ 
          error: "Failed to run project",
          code: "PROJECT_RUN_ERROR"
        });
      }
    }
  );

  app.post("/api/projects/:id/stop", 
    isAuthenticated,
    validateProjectId,
    handleValidationErrors,
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const projectId = parseInt(req.params.id);

        // Verify project ownership
        const project = await storage.getProject(projectId);
        if (!project || project.userId !== userId) {
          return res.status(404).json({ 
            error: "Project not found",
            code: "PROJECT_NOT_FOUND"
          });
        }

        // Stop all preview sessions for this project
        const { previewService } = await import("./services/preview");
        const sessions = previewService.getAllSessions().filter(
          s => s.projectId === projectId.toString() && s.userId === userId
        );

        for (const session of sessions) {
          await previewService.destroyPreviewSession(session.id);
        }

        res.json({
          message: "Project execution stopped",
          projectId,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error("Error stopping project:", error);
        res.status(500).json({ 
          error: "Failed to stop project",
          code: "PROJECT_STOP_ERROR"
        });
      }
    }
  );

  // Preview proxy route to handle iframe access
  app.get("/api/preview/:sessionId/*", async (req, res) => {
    try {
      const { sessionId } = req.params;
      const filePath = (req.params as any)[0] || '';

      // Find the preview session
      const { getPreviewSession } = await import("./services/preview");
      const session = getPreviewSession(sessionId);

      if (!session) {
        return res.status(404).json({ 
          error: "Preview session not found",
          code: "PREVIEW_SESSION_NOT_FOUND"
        });
      }

      // Proxy the request to the preview server
      const fetch = (await import('node-fetch')).default;
      const previewUrl = `http://localhost:${session.port}/${filePath}`;

      try {
        const response = await fetch(previewUrl);
        const content = await response.text();

        // Set appropriate headers
        res.set({
          'Content-Type': response.headers.get('content-type') || 'text/html',
          'X-Frame-Options': 'SAMEORIGIN',
          'Access-Control-Allow-Origin': '*'
        });

        res.send(content);
      } catch (fetchError) {
        res.status(503).send(`
          <html>
            <body style="font-family: system-ui; padding: 2rem; text-align: center;">
              <h2>Preview Not Available</h2>
              <p>The preview server is starting up. Please wait a moment and refresh.</p>
              <button onclick="location.reload()">Refresh</button>
            </body>
          </html>
        `);
      }
    } catch (error) {
      console.error("Preview proxy error:", error);
      res.status(500).json({ 
        error: "Preview proxy error",
        code: "PREVIEW_PROXY_ERROR"
      });
    }
  });

  // Handle root preview path
  app.get("/api/preview/:sessionId", (req, res, next) => {
    req.url = req.url + '/';
    (req.params as any)[0] = '';
    next();
  });

  // Force refresh file tree with file sync
  app.post('/api/projects/:id/files/refresh', 
    isAuthenticated,
    validateProjectId,
    handleValidationErrors,
    async (req: any, res) => {
      const projectId = parseInt(req.params.id);
      const userId = req.user.claims.sub;
      
      console.log(`Manual file tree refresh requested for project ${projectId}`);

      try {
        // Verify project ownership
        const project = await storage.getProject(projectId);
        if (!project || project.userId !== userId) {
          return res.status(404).json({ 
            error: "Project not found",
            code: "PROJECT_NOT_FOUND"
          });
        }

        // Import FileSync and force sync
        const { fileSyncRegistry } = await import('./services/fileSync');
        const { tmpdir } = await import('os');
        const { join } = await import('path');
        
        const workspaceDir = join(tmpdir(), 'shetty-workspace', userId, projectId.toString());
        const fileSync = fileSyncRegistry.getOrCreate(projectId, workspaceDir, globalIO);

        // Force immediate sync
        await fileSync.forceSyncNow();
        console.log(`Files synced for project ${projectId}`);

        // Force refresh by emitting socket event
        if (globalIO) {
          globalIO.to(`project-${projectId}`).emit('files:forceRefresh', { projectId });
          console.log(`Force refreshing file tree for project ${projectId}`);
        }

        res.json({ 
          success: true, 
          synced: true,
          projectId,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('Error during file sync:', error);

        // Still try to refresh UI
        if (globalIO) {
          globalIO.to(`project-${projectId}`).emit('files:forceRefresh', { projectId });
        }
        
        const errorMessage = error instanceof Error ? error.message : String(error);
        res.json({ 
          success: true, 
          synced: false, 
          error: errorMessage,
          projectId,
          timestamp: new Date().toISOString()
        });
      }
    }
  );

  // Admin routes (if admin emails are configured)
  if (process.env.ADMIN_EMAILS) {
    const { requireAdmin } = await import('./replitAuth');
    
    app.get('/api/admin/stats', requireAdmin, async (req, res) => {
      try {
        const stats = await storage.getSystemStats();
        res.json({
          ...stats,
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          memory: process.memoryUsage()
        });
      } catch (error) {
        console.error('Error fetching admin stats:', error);
        res.status(500).json({ 
          error: 'Failed to fetch system statistics',
          code: 'ADMIN_STATS_ERROR'
        });
      }
    });
  }

  const httpServer = createServer(app);
  return httpServer;
}
