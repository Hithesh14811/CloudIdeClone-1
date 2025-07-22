import { spawn, ChildProcess } from 'child_process';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

export interface ContainerSession {
  id: string;
  projectId: string;
  userId: string;
  process?: ChildProcess;
  workingDir: string;
}

class DockerService {
  private sessions = new Map<string, ContainerSession>();

  async createContainer(projectId: string, userId: string, files: any[]): Promise<ContainerSession> {
    const sessionId = `${userId}-${projectId}-${Date.now()}`;
    const workingDir = join(tmpdir(), 'shetty', sessionId);
    
    // Create working directory
    if (!existsSync(workingDir)) {
      mkdirSync(workingDir, { recursive: true });
    }

    // Write project files to filesystem
    for (const file of files) {
      if (!file.isFolder && file.content) {
        const filePath = join(workingDir, file.name);
        writeFileSync(filePath, file.content);
      }
    }

    const session: ContainerSession = {
      id: sessionId,
      projectId,
      userId,
      workingDir
    };

    this.sessions.set(sessionId, session);
    return session;
  }

  async executeCommand(sessionId: string, command: string): Promise<ChildProcess> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    // For now, execute commands directly in the working directory
    // In a real implementation, this would use Docker containers
    const childProcess = spawn('bash', ['-c', command], {
      cwd: session.workingDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true
    });

    session.process = childProcess;
    return childProcess;
  }

  async destroyContainer(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      if (session.process) {
        session.process.kill('SIGTERM');
      }
      this.sessions.delete(sessionId);
    }
  }

  getSession(sessionId: string): ContainerSession | undefined {
    return this.sessions.get(sessionId);
  }

  getAllSessions(): ContainerSession[] {
    return Array.from(this.sessions.values());
  }
}

export const dockerService = new DockerService();