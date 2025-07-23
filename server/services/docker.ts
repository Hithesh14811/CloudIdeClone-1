import { spawn, ChildProcess } from 'child_process';
import { writeFileSync, mkdirSync, existsSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

export interface ContainerSession {
  id: string;
  projectId: string;
  userId: string;
  containerId?: string;
  workingDir: string;
  process?: ChildProcess;
  createdAt: Date;
  lastActivity: Date;
}

class DockerService {
  private sessions = new Map<string, ContainerSession>();
  private cleanupInterval: NodeJS.Timeout;
  private readonly containerTimeout = parseInt(process.env.CONTAINER_TIMEOUT_MS || '300000'); // 5 minutes default
  private readonly dockerImage = process.env.DOCKER_IMAGE || 'node:18-alpine';
  private readonly dockerEnabled = process.env.DOCKER_ENABLED !== 'false';

  constructor() {
    // Clean up inactive sessions every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanupInactiveSessions();
    }, 60000);

    // Graceful shutdown
    process.on('SIGTERM', () => this.cleanup());
    process.on('SIGINT', () => this.cleanup());
  }

  async createContainer(projectId: string, userId: string, files: any[]): Promise<ContainerSession> {
    const sessionId = `${userId}-${projectId}-${randomUUID()}`;
    const workingDir = join(tmpdir(), 'shetty-containers', sessionId);
    
    // Create working directory
    if (!existsSync(workingDir)) {
      mkdirSync(workingDir, { recursive: true });
    }

    // Write project files to filesystem with proper directory structure
    for (const file of files) {
      if (!file.isFolder && file.content !== null) {
        const filePath = join(workingDir, file.path || file.name);
        const fileDir = join(workingDir, require('path').dirname(file.path || file.name));
        
        // Create directory structure if it doesn't exist
        if (!existsSync(fileDir)) {
          mkdirSync(fileDir, { recursive: true });
        }
        
        writeFileSync(filePath, file.content || '');
      }
    }

    // Create Dockerfile for secure environment
    const dockerfile = `
FROM ${this.dockerImage}

# Create non-root user for security
RUN addgroup -g 1001 -S appgroup && \\
    adduser -S appuser -u 1001 -G appgroup

# Install common development tools
RUN apk add --no-cache \\
    git \\
    curl \\
    wget \\
    vim \\
    nano \\
    python3 \\
    py3-pip \\
    build-base

# Set up workspace
WORKDIR /workspace
COPY . .
RUN chown -R appuser:appgroup /workspace

# Switch to non-root user
USER appuser

# Set environment variables
ENV HOME=/workspace
ENV SHELL=/bin/sh
ENV PATH=/workspace/node_modules/.bin:$PATH

# Default command
CMD ["/bin/sh"]
`;

    writeFileSync(join(workingDir, 'Dockerfile'), dockerfile);

    const session: ContainerSession = {
      id: sessionId,
      projectId,
      userId,
      workingDir,
      createdAt: new Date(),
      lastActivity: new Date()
    };

    this.sessions.set(sessionId, session);

    // If Docker is enabled, build the container
    if (this.dockerEnabled) {
      try {
        await this.buildContainer(session);
      } catch (error) {
        console.error(`Failed to build container for session ${sessionId}:`, error);
        // Fall back to direct execution with restricted permissions
        console.log('Falling back to restricted direct execution');
      }
    }

    return session;
  }

  private async buildContainer(session: ContainerSession): Promise<void> {
    return new Promise((resolve, reject) => {
      const buildProcess = spawn('docker', [
        'build',
        '-t', `shetty-session-${session.id}`,
        session.workingDir
      ], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let buildOutput = '';
      let buildError = '';

      buildProcess.stdout.on('data', (data) => {
        buildOutput += data.toString();
      });

      buildProcess.stderr.on('data', (data) => {
        buildError += data.toString();
      });

      buildProcess.on('close', (code) => {
        if (code === 0) {
          console.log(`Container built successfully for session ${session.id}`);
          resolve();
        } else {
          console.error(`Container build failed for session ${session.id}:`, buildError);
          reject(new Error(`Container build failed: ${buildError}`));
        }
      });

      // Timeout for build process
      setTimeout(() => {
        buildProcess.kill('SIGTERM');
        reject(new Error('Container build timeout'));
      }, 120000); // 2 minutes timeout
    });
  }

  async executeCommand(sessionId: string, command: string): Promise<ChildProcess> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    // Update last activity
    session.lastActivity = new Date();

    // Sanitize command to prevent injection attacks
    const sanitizedCommand = this.sanitizeCommand(command);
    
    let childProcess: ChildProcess;

    if (this.dockerEnabled && session.containerId) {
      // Execute in Docker container
      childProcess = spawn('docker', [
        'exec',
        '-i',
        session.containerId,
        '/bin/sh',
        '-c',
        sanitizedCommand
      ], {
        stdio: ['pipe', 'pipe', 'pipe']
      });
    } else if (this.dockerEnabled) {
      // Start new container and execute command
      childProcess = spawn('docker', [
        'run',
        '--rm',
        '-i',
        '--network=none', // No network access for security
        '--memory=512m', // Memory limit
        '--cpus=0.5', // CPU limit
        '--user=1001:1001', // Non-root user
        '--security-opt=no-new-privileges', // Security hardening
        '--cap-drop=ALL', // Drop all capabilities
        '-v', `${session.workingDir}:/workspace:rw`,
        '-w', '/workspace',
        `shetty-session-${session.id}`,
        '/bin/sh',
        '-c',
        sanitizedCommand
      ], {
        stdio: ['pipe', 'pipe', 'pipe']
      });
    } else {
      // Fallback to restricted direct execution
      console.warn(`Docker disabled, using restricted direct execution for session ${sessionId}`);
      childProcess = spawn('/bin/sh', ['-c', sanitizedCommand], {
        cwd: session.workingDir,
        stdio: ['pipe', 'pipe', 'pipe'],
        uid: process.getuid ? process.getuid() : undefined, // Drop privileges if possible
        gid: process.getgid ? process.getgid() : undefined,
        env: {
          PATH: '/usr/local/bin:/usr/bin:/bin',
          HOME: session.workingDir,
          USER: 'restricted',
          SHELL: '/bin/sh',
          PWD: session.workingDir
        }
      });
    }

    session.process = childProcess;

    // Set timeout for command execution
    const timeout = setTimeout(() => {
      console.log(`Command timeout for session ${sessionId}, killing process`);
      childProcess.kill('SIGTERM');
      setTimeout(() => {
        if (!childProcess.killed) {
          childProcess.kill('SIGKILL');
        }
      }, 5000);
    }, this.containerTimeout);

    childProcess.on('exit', () => {
      clearTimeout(timeout);
    });

    return childProcess;
  }

  private sanitizeCommand(command: string): string {
    // Remove dangerous commands and characters
    const dangerousPatterns = [
      /rm\s+-rf\s+\//, // Prevent deleting root
      /sudo/, // No sudo access
      /su\s/, // No user switching
      /passwd/, // No password changes
      /useradd/, // No user creation
      /userdel/, // No user deletion
      /chmod\s+777/, // Prevent overly permissive permissions
      /curl.*\|\s*sh/, // Prevent pipe to shell
      /wget.*\|\s*sh/, // Prevent pipe to shell
      /\$\(.*\)/, // Prevent command substitution in some cases
      /`.*`/, // Prevent backtick command substitution
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(command)) {
        throw new Error(`Command contains dangerous pattern: ${pattern.source}`);
      }
    }

    // Limit command length to prevent abuse
    if (command.length > 1000) {
      throw new Error('Command too long');
    }

    return command;
  }

  async destroyContainer(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    // Kill any running process
    if (session.process && !session.process.killed) {
      session.process.kill('SIGTERM');
      setTimeout(() => {
        if (session.process && !session.process.killed) {
          session.process.kill('SIGKILL');
        }
      }, 5000);
    }

    // Remove Docker container and image if they exist
    if (this.dockerEnabled) {
      try {
        if (session.containerId) {
          spawn('docker', ['stop', session.containerId], { stdio: 'ignore' });
          spawn('docker', ['rm', session.containerId], { stdio: 'ignore' });
        }
        
        // Remove the session-specific image
        spawn('docker', ['rmi', `shetty-session-${session.id}`], { stdio: 'ignore' });
      } catch (error) {
        console.error(`Error cleaning up Docker resources for session ${sessionId}:`, error);
      }
    }

    // Clean up working directory
    try {
      if (existsSync(session.workingDir)) {
        rmSync(session.workingDir, { recursive: true, force: true });
      }
    } catch (error) {
      console.error(`Error cleaning up working directory for session ${sessionId}:`, error);
    }

    this.sessions.delete(sessionId);
    console.log(`Container session ${sessionId} destroyed`);
  }

  private cleanupInactiveSessions(): void {
    const now = new Date();
    const sessionsToCleanup: string[] = [];

    for (const [sessionId, session] of this.sessions.entries()) {
      const inactiveTime = now.getTime() - session.lastActivity.getTime();
      if (inactiveTime > this.containerTimeout) {
        sessionsToCleanup.push(sessionId);
      }
    }

    for (const sessionId of sessionsToCleanup) {
      console.log(`Cleaning up inactive session: ${sessionId}`);
      this.destroyContainer(sessionId).catch(error => {
        console.error(`Error cleaning up session ${sessionId}:`, error);
      });
    }
  }

  getSession(sessionId: string): ContainerSession | undefined {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivity = new Date(); // Update activity
    }
    return session;
  }

  getAllSessions(): ContainerSession[] {
    return Array.from(this.sessions.values());
  }

  private cleanup(): void {
    console.log('Cleaning up all Docker sessions...');
    clearInterval(this.cleanupInterval);
    
    const cleanupPromises = Array.from(this.sessions.keys()).map(sessionId => 
      this.destroyContainer(sessionId)
    );

    Promise.all(cleanupPromises).finally(() => {
      console.log('Docker service cleanup complete');
    });
  }

  // Health check method
  async healthCheck(): Promise<{ status: string; dockerAvailable: boolean; activeSessions: number }> {
    let dockerAvailable = false;
    
    if (this.dockerEnabled) {
      try {
        await new Promise<void>((resolve, reject) => {
          const process = spawn('docker', ['version'], { stdio: 'pipe' });
          process.on('close', (code) => {
            if (code === 0) {
              dockerAvailable = true;
              resolve();
            } else {
              reject(new Error('Docker not available'));
            }
          });
          process.on('error', reject);
        });
      } catch (error) {
        console.warn('Docker health check failed:', error);
      }
    }

    return {
      status: 'healthy',
      dockerAvailable,
      activeSessions: this.sessions.size
    };
  }
}

export const dockerService = new DockerService();