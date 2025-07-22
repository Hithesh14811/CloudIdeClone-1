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
            <title>Project Preview</title>
            <style>
              body { font-family: system-ui; padding: 2rem; text-align: center; }
              .message { color: #666; margin-top: 2rem; }
            </style>
          </head>
          <body>
            <h1>Project Preview</h1>
            <div class="message">
              <p>No index.html file found in your project.</p>
              <p>Create an index.html file to see your project here.</p>
            </div>
          </body>
          </html>
        `);
      }
    });

    const server = createServer(app);
    server.listen(port, '0.0.0.0');

    const previewUrl = `http://localhost:${port}`;

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