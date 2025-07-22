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
      
      // Get project context if provided
      let contextInfo = "";
      if (projectId) {
        const project = await storage.getProject(parseInt(projectId));
        if (project && project.userId === userId) {
          const files = await storage.getProjectFiles(parseInt(projectId));
          contextInfo = `\nCurrent project: ${project.name}\nFiles: ${files.map(f => f.name).join(', ')}`;
        }
      }
      
      // Generate contextual responses based on message content
      let response = "";
      const lowerMessage = message.toLowerCase();
      
      if (lowerMessage.includes('help') || lowerMessage.includes('hello') || lowerMessage.includes('hi')) {
        response = `Hello! I'm your coding assistant for Shetty IDE. I can help you:
        
• Build web applications with HTML, CSS, and JavaScript
• Debug your code and fix errors
• Create new files and folders
• Suggest improvements and best practices
• Answer coding questions

What would you like to work on today?${contextInfo}`;
      } else if (lowerMessage.includes('create') && (lowerMessage.includes('file') || lowerMessage.includes('component'))) {
        response = `I can help you create files! Here are some options:

• HTML file: Create index.html with basic structure
• JavaScript file: Create script.js with starter code
• CSS file: Create styles.css with basic styling
• React component: Create a reusable component

Would you like me to create a specific type of file for your project?${contextInfo}`;
      } else if (lowerMessage.includes('html') || lowerMessage.includes('web')) {
        response = `Great! I can help with HTML and web development. Here's what I can assist with:

• Creating semantic HTML structure
• Adding forms, navigation, and content sections
• Implementing responsive design
• Connecting CSS and JavaScript files
• SEO optimization tips

What specific HTML feature would you like to implement?${contextInfo}`;
      } else if (lowerMessage.includes('javascript') || lowerMessage.includes('js')) {
        response = `JavaScript is perfect for adding interactivity! I can help with:

• DOM manipulation and event handling
• Async/await and API calls
• Functions and data structures
• Modern ES6+ features
• Debugging common issues

What JavaScript functionality are you looking to add?${contextInfo}`;
      } else if (lowerMessage.includes('css') || lowerMessage.includes('style')) {
        response = `CSS styling can make your project look amazing! I can help with:

• Layout techniques (Flexbox, Grid)
• Responsive design and media queries
• Animations and transitions
• Color schemes and typography
• Component styling patterns

What styling challenges are you facing?${contextInfo}`;
      } else if (lowerMessage.includes('error') || lowerMessage.includes('debug') || lowerMessage.includes('fix')) {
        response = `I'm here to help debug! To better assist you:

• Share the error message if you have one
• Tell me what you expected vs what happened  
• Let me know which file has the issue

I can help identify common issues like:
• Syntax errors and typos
• Missing imports or references
• Logic problems
• Browser compatibility issues${contextInfo}`;
      } else {
        response = `I understand you're asking about: "${message}"

While I'm still learning, I can help with web development fundamentals:
• HTML structure and semantics
• CSS styling and layout
• JavaScript functionality
• File organization
• Best practices

Could you be more specific about what you'd like to build or fix?${contextInfo}`;
      }
      
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
