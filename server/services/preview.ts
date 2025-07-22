import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import express from 'express';
import { createServer } from 'http';
import { storage } from '../storage';

export interface PreviewSession {
  id: string;
  projectId: string;
  userId: string;
  port: number;
  previewUrl: string;
  server?: any;
  workingDir: string;
}

class PreviewService {
  private sessions = new Map<string, PreviewSession>();
  private portCounter = 3001;
  private expressApp?: express.Express;

  async createPreviewSession(projectId: string, userId: string): Promise<PreviewSession> {
    const sessionId = `preview-${userId}-${projectId}-${Date.now()}`;
    const port = this.portCounter++;
    const workingDir = join(tmpdir(), 'shetty-preview', sessionId);
    
    // Create working directory
    if (!existsSync(workingDir)) {
      mkdirSync(workingDir, { recursive: true });
    }

    // Get project files
    const files = await storage.getProjectFiles(parseInt(projectId));
    
    // Write files to filesystem
    for (const file of files) {
      if (!file.isFolder && file.content) {
        const filePath = join(workingDir, file.name);
        // Create subdirectories if needed
        const dir = join(workingDir, file.path.substring(0, file.path.lastIndexOf('/')));
        if (dir !== workingDir && !existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }
        writeFileSync(filePath, file.content);
      }
    }

    // Create express server for this session
    const app = express();
    app.use(express.static(workingDir));
    
    // Add CORS headers for iframe access
    app.use((req, res, next) => {
      res.header('X-Frame-Options', 'SAMEORIGIN');
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
      next();
    });

    // Serve index.html by default
    app.get('/', (req, res) => {
      const indexPath = join(workingDir, 'index.html');
      if (existsSync(indexPath)) {
        const content = readFileSync(indexPath, 'utf-8');
        res.send(content);
      } else {
        res.send(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Project Preview - Shetty IDE</title>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
              body { 
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
                padding: 2rem; 
                text-align: center; 
                background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
                min-height: 100vh;
                margin: 0;
                display: flex;
                align-items: center;
                justify-content: center;
              }
              .container {
                background: white;
                padding: 3rem;
                border-radius: 15px;
                box-shadow: 0 10px 25px rgba(0,0,0,0.1);
                max-width: 500px;
              }
              h1 { color: #2c3e50; margin-bottom: 1rem; }
              .message { color: #666; margin-top: 1rem; line-height: 1.6; }
              .code { background: #f8f9fa; padding: 0.5rem; border-radius: 4px; font-family: monospace; margin: 1rem 0; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>🚀 Shetty Preview</h1>
              <div class="message">
                <p>Your project is running successfully!</p>
                <p>Create an <code class="code">index.html</code> file to see your website here.</p>
                <p><small>Preview URL: ${req.get('host')}</small></p>
              </div>
            </div>
          </body>
          </html>
        `);
      }
    });

    // Catch-all route for SPA support
    app.get('*', (req, res) => {
      const filePath = join(workingDir, req.path.substring(1));
      if (existsSync(filePath) && !filePath.includes('..')) {
        res.sendFile(filePath);
      } else {
        // Try to serve index.html for SPA routing
        const indexPath = join(workingDir, 'index.html');
        if (existsSync(indexPath)) {
          res.sendFile(indexPath);
        } else {
          res.status(404).send('File not found');
        }
      }
    });

    const server = createServer(app);
    
    // Listen on all interfaces to ensure accessibility from iframe
    await new Promise<void>((resolve, reject) => {
      server.listen(port, '0.0.0.0', (error?: Error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });

    // Use proxy URL to avoid CORS issues with iframe
    const previewUrl = `http://localhost:5000/api/preview/${sessionId}`;

    const session: PreviewSession = {
      id: sessionId,
      projectId,
      userId,
      port,
      previewUrl,
      server,
      workingDir
    };

    this.sessions.set(sessionId, session);
    return session;
  }

  async refreshPreviewSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Preview session not found');
    }

    // Get updated project files
    const files = await storage.getProjectFiles(parseInt(session.projectId));
    
    // Update files in filesystem
    for (const file of files) {
      if (!file.isFolder && file.content) {
        const filePath = join(session.workingDir, file.name);
        writeFileSync(filePath, file.content);
      }
    }
  }

  async destroyPreviewSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      if (session.server) {
        session.server.close();
      }
      this.sessions.delete(sessionId);
    }
  }

  getSession(sessionId: string): PreviewSession | undefined {
    return this.sessions.get(sessionId);
  }

  getAllSessions(): PreviewSession[] {
    return Array.from(this.sessions.values());
  }
}

export const previewService = new PreviewService();

// Function to update preview files when AI modifies them
export async function updatePreviewFiles(projectId: string, userId: string): Promise<void> {
  const sessions = previewService.getAllSessions().filter(
    s => s.projectId === projectId && s.userId === userId
  );

  for (const session of sessions) {
    try {
      await previewService.refreshPreviewSession(session.id);
    } catch (error) {
      console.error('Error updating preview files:', error);
    }
  }
}

export function getPreviewSession(sessionId: string): PreviewSession | undefined {
  return previewService.getSession(sessionId);
}