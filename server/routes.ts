import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { insertProjectSchema, insertFileSchema } from "@shared/schema";
import { z } from "zod";
import { processAIRequest } from "./services/aiAgent";
import { updatePreviewFiles } from "./services/preview";

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Project routes
  app.get("/api/projects", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const projects = await storage.getUserProjects(userId);
      res.json(projects);
    } catch (error) {
      console.error("Error fetching projects:", error);
      res.status(500).json({ message: "Failed to fetch projects" });
    }
  });

  app.post("/api/projects", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const projectData = insertProjectSchema.parse({
        ...req.body,
        userId,
      });
      
      const project = await storage.createProject(projectData);
      
      // Create default files for new project
      await storage.createFile({
        name: "index.html",
        path: "/index.html",
        content: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>My App</title>
</head>
<body>
    <h1>Hello World!</h1>
    <script src="script.js"></script>
</body>
</html>`,
        isFolder: false,
        projectId: project.id,
      });
      
      await storage.createFile({
        name: "script.js",
        path: "/script.js",
        content: `// Welcome to your new project!
console.log('Hello from Shetty IDE!');`,
        isFolder: false,
        projectId: project.id,
      });
      
      await storage.createFile({
        name: "style.css",
        path: "/style.css",
        content: `/* Add your styles here */
body {
    font-family: Arial, sans-serif;
    margin: 0;
    padding: 20px;
    background-color: #f0f0f0;
}`,
        isFolder: false,
        projectId: project.id,
      });
      
      res.json(project);
    } catch (error) {
      console.error("Error creating project:", error);
      res.status(500).json({ message: "Failed to create project" });
    }
  });

  app.delete("/api/projects/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const projectId = parseInt(req.params.id);
      
      const project = await storage.getProject(projectId);
      if (!project || project.userId !== userId) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      await storage.deleteProject(projectId);
      res.json({ message: "Project deleted successfully" });
    } catch (error) {
      console.error("Error deleting project:", error);
      res.status(500).json({ message: "Failed to delete project" });
    }
  });

  app.get("/api/projects/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const projectId = parseInt(req.params.id);
      
      const project = await storage.getProject(projectId);
      if (!project || project.userId !== userId) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      res.json(project);
    } catch (error) {
      console.error("Error fetching project:", error);
      res.status(500).json({ message: "Failed to fetch project" });
    }
  });

  // File routes
  app.get("/api/projects/:projectId/files", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const projectId = parseInt(req.params.projectId);
      
      // Verify project ownership
      const project = await storage.getProject(projectId);
      if (!project || project.userId !== userId) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      const files = await storage.getProjectFiles(projectId);
      res.json(files);
    } catch (error) {
      console.error("Error fetching files:", error);
      res.status(500).json({ message: "Failed to fetch files" });
    }
  });

  app.post("/api/projects/:projectId/files", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const projectId = parseInt(req.params.projectId);
      
      // Verify project ownership
      const project = await storage.getProject(projectId);
      if (!project || project.userId !== userId) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      const fileData = insertFileSchema.parse({
        ...req.body,
        projectId,
      });
      
      const file = await storage.createFile(fileData);
      res.json(file);
    } catch (error) {
      console.error("Error creating file:", error);
      res.status(500).json({ message: "Failed to create file" });
    }
  });

  app.put("/api/files/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const fileId = parseInt(req.params.id);
      
      // Verify file ownership through project
      const file = await storage.getFile(fileId);
      if (!file) {
        return res.status(404).json({ message: "File not found" });
      }
      
      const project = await storage.getProject(file.projectId);
      if (!project || project.userId !== userId) {
        return res.status(404).json({ message: "File not found" });
      }
      
      const updates = z.object({
        content: z.string().optional(),
        name: z.string().optional(),
      }).parse(req.body);
      
      const updatedFile = await storage.updateFile(fileId, updates);
      res.json(updatedFile);
    } catch (error) {
      console.error("Error updating file:", error);
      res.status(500).json({ message: "Failed to update file" });
    }
  });

  app.delete("/api/files/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const fileId = parseInt(req.params.id);
      
      // Verify file ownership through project
      const file = await storage.getFile(fileId);
      if (!file) {
        return res.status(404).json({ message: "File not found" });
      }
      
      const project = await storage.getProject(file.projectId);
      if (!project || project.userId !== userId) {
        return res.status(404).json({ message: "File not found" });
      }
      
      await storage.deleteFile(fileId);
      res.json({ message: "File deleted successfully" });
    } catch (error) {
      console.error("Error deleting file:", error);
      res.status(500).json({ message: "Failed to delete file" });
    }
  });

  // AI Assistant routes
  app.post("/api/ai/chat", isAuthenticated, async (req, res) => {
    try {
      const { message, projectId } = req.body;
      const userId = (req as any).user.claims.sub;
      
      if (!projectId) {
        return res.status(400).json({ message: "Project ID is required" });
      }
      
      // Use the AI service to process the request and potentially modify files
      const aiResponse = await processAIRequest(message, parseInt(projectId), userId);
      
      // If files were modified, trigger preview update
      if (aiResponse.actions && aiResponse.actions.length > 0) {
        // Update preview if there's an active session
        updatePreviewFiles(projectId, userId).catch(console.error);
      }
      
      res.json({
        message: aiResponse.message,
        actions: aiResponse.actions,
        success: aiResponse.success,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Error in AI chat:", error);
      res.status(500).json({ message: "Failed to process AI request" });
    }
  });

  // Project execution routes
  app.post("/api/projects/:id/run", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const projectId = parseInt(req.params.id);
      
      // Verify project ownership
      const project = await storage.getProject(projectId);
      if (!project || project.userId !== userId) {
        return res.status(404).json({ message: "Project not found" });
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
      res.status(500).json({ message: "Failed to run project" });
    }
  });

  app.post("/api/projects/:id/stop", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const projectId = parseInt(req.params.id);
      
      // Verify project ownership
      const project = await storage.getProject(projectId);
      if (!project || project.userId !== userId) {
        return res.status(404).json({ message: "Project not found" });
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
      res.status(500).json({ message: "Failed to stop project" });
    }
  });

  // Preview proxy route to handle iframe access
  app.get("/api/preview/:sessionId/*", async (req, res) => {
    try {
      const { sessionId } = req.params;
      const filePath = (req.params as any)[0] || '';
      
      // Find the preview session
      const { getPreviewSession } = await import("./services/preview");
      const session = getPreviewSession(sessionId);
      
      if (!session) {
        return res.status(404).json({ message: "Preview session not found" });
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
      res.status(500).json({ message: "Preview proxy error" });
    }
  });

  // Handle root preview path
  app.get("/api/preview/:sessionId", (req, res, next) => {
    req.url = req.url + '/';
    (req.params as any)[0] = '';
    next();
  });

  // Force refresh file tree with file sync
  app.post('/api/projects/:id/files/refresh', async (req: any, res) => {
    const projectId = parseInt(req.params.id);
    console.log(`Manual file tree refresh requested for project ${projectId}`);
    
    try {
      // Import FileSync and force sync
      const { FileSync } = await import('./services/fileSync');
      const workspaceDir = `/tmp/shetty-workspace/${process.env.REPL_ID || 'dev'}/${projectId}`;
      const fileSync = new FileSync(projectId, workspaceDir);
      
      // Force immediate sync
      await fileSync.forceSyncNow();
      console.log(`Files synced for project ${projectId}`);
      
      // Force refresh by emitting socket event
      const io = req.app.get('io');
      if (io) {
        io.emit('files:forceRefresh', { projectId });
        console.log(`Force refreshing file tree for project ${projectId}`);
      }
      
      res.json({ success: true, synced: true });
    } catch (error) {
      console.error('Error during file sync:', error);
      
      // Still try to refresh UI
      const io = req.app.get('io');
      if (io) {
        io.emit('files:forceRefresh', { projectId });
      }
      const errorMessage = error instanceof Error ? error.message : String(error);
      res.json({ success: true, synced: false, error: errorMessage });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
