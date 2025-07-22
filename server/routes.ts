import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { insertProjectSchema, insertFileSchema } from "@shared/schema";
import { z } from "zod";

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

  // AI Assistant routes (mocked for MVP)
  app.post("/api/ai/chat", isAuthenticated, async (req, res) => {
    try {
      const { message } = req.body;
      
      // Mock AI response
      const responses = [
        "I can help you with that! Let me analyze your code and provide suggestions.",
        "Based on your request, here's what I recommend...",
        "I notice you're working on a web application. Would you like me to help with the HTML structure?",
        "That's a great question! Here's how you can implement that feature...",
        "I can see some improvements we can make to your code. Let me show you..."
      ];
      
      const response = responses[Math.floor(Math.random() * responses.length)];
      
      res.json({
        message: response,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Error in AI chat:", error);
      res.status(500).json({ message: "Failed to process AI request" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
