import { Server as SocketIOServer } from 'socket.io';
import { spawn, ChildProcess } from 'child_process';
import { storage } from '../storage';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

interface TerminalSession {
  id: string;
  projectId: string;
  userId: string;
  workingDir: string;
  currentDir: string;
  process?: ChildProcess;
}

const terminalSessions = new Map<string, TerminalSession>();

export function setupTerminalSocket(io: SocketIOServer) {
  io.on('connection', (socket) => {
    console.log('Terminal socket connected:', socket.id);

    socket.on('terminal:start', async (data: { projectId: string, userId: string }) => {
      try {
        const { projectId, userId } = data;
        const sessionId = `terminal-${userId}-${projectId}-${Date.now()}`;
        
        // Create workspace directory
        const workingDir = join(tmpdir(), 'shetty-workspace', userId, projectId);
        if (!existsSync(workingDir)) {
          mkdirSync(workingDir, { recursive: true });
        }

        // Get project files and write them to filesystem
        const files = await storage.getProjectFiles(parseInt(projectId));
        for (const file of files) {
          if (!file.isFolder && file.content) {
            const filePath = join(workingDir, file.name);
            writeFileSync(filePath, file.content);
          }
        }
        
        const session: TerminalSession = {
          id: sessionId,
          projectId,
          userId,
          workingDir,
          currentDir: workingDir
        };
        
        terminalSessions.set(sessionId, session);

        socket.emit('terminal:ready', { sessionId });
        socket.emit('terminal:output', 'Welcome to Shetty Terminal\n');
        socket.emit('terminal:output', 'Type "help" for available commands\n');
        socket.emit('terminal:output', '$ ');
      } catch (error) {
        console.error('Error starting terminal:', error);
        socket.emit('terminal:error', { message: 'Failed to start terminal' });
      }
    });

    socket.on('terminal:input', async (data: { sessionId: string, input: string }) => {
      try {
        const { sessionId, input } = data;
        const session = terminalSessions.get(sessionId);
        
        if (!session) {
          socket.emit('terminal:error', { message: 'No active terminal session' });
          return;
        }

        const command = input.trim();
        
        // Handle basic commands
        if (command === 'help') {
          socket.emit('terminal:output', 'Available commands:\n');
          socket.emit('terminal:output', '  help       - Show this help\n');
          socket.emit('terminal:output', '  ls         - List files\n');
          socket.emit('terminal:output', '  cat <file> - Show file contents\n');
          socket.emit('terminal:output', '  pwd        - Show current directory\n');
          socket.emit('terminal:output', '  clear      - Clear terminal\n');
          socket.emit('terminal:output', '  node -v    - Show Node.js version\n');
          socket.emit('terminal:output', '  npm -v     - Show npm version\n');
        } else if (command === 'clear') {
          socket.emit('terminal:output', '\x1b[2J\x1b[H');
        } else if (command === 'ls') {
          const { readdirSync } = await import('fs');
          try {
            const files = readdirSync(session.currentDir);
            files.forEach(file => {
              socket.emit('terminal:output', file + '\n');
            });
          } catch (error) {
            socket.emit('terminal:output', 'Error listing files\n');
          }
        } else if (command === 'pwd') {
          socket.emit('terminal:output', session.currentDir + '\n');
        } else if (command.startsWith('cat ')) {
          const filename = command.substring(4).trim();
          const { readFileSync } = await import('fs');
          try {
            const filePath = join(session.currentDir, filename);
            const content = readFileSync(filePath, 'utf-8');
            socket.emit('terminal:output', content + '\n');
          } catch (error) {
            socket.emit('terminal:output', `cat: ${filename}: No such file or directory\n`);
          }
        } else if (command === 'node -v') {
          socket.emit('terminal:output', 'v18.17.0\n');
        } else if (command === 'npm -v') {
          socket.emit('terminal:output', '9.6.7\n');
        } else if (command.startsWith('echo ')) {
          const message = command.substring(5);
          socket.emit('terminal:output', message + '\n');
        } else {
          // Try to execute the command directly
          const childProcess = spawn('bash', ['-c', command], {
            cwd: session.currentDir,
            stdio: ['pipe', 'pipe', 'pipe']
          });

          childProcess.stdout.on('data', (data) => {
            socket.emit('terminal:output', data.toString());
          });

          childProcess.stderr.on('data', (data) => {
            socket.emit('terminal:output', `\x1b[31m${data.toString()}\x1b[0m`);
          });

          childProcess.on('close', (code) => {
            socket.emit('terminal:output', '$ ');
          });

          // Handle process not found
          childProcess.on('error', (error) => {
            socket.emit('terminal:output', `Command not found: ${command}\n`);
            socket.emit('terminal:output', '$ ');
          });
          
          return; // Don't send prompt yet, wait for process to finish
        }
        
        // Send new prompt
        socket.emit('terminal:output', '$ ');
      } catch (error) {
        console.error('Error executing terminal command:', error);
        socket.emit('terminal:output', `Error: ${error}\n$ `);
      }
    });

    socket.on('terminal:resize', (data: { sessionId: string, cols: number, rows: number }) => {
      const { sessionId, cols, rows } = data;
      const session = terminalSessions.get(sessionId);
      
      if (session) {
        try {
          // Terminal resize handling would go here
          console.log(`Terminal resized to ${cols}x${rows}`);
        } catch (error) {
          console.error('Error resizing terminal:', error);
        }
      }
    });

    socket.on('terminal:stop', (data: { sessionId: string }) => {
      const { sessionId } = data;
      const session = terminalSessions.get(sessionId);
      
      if (session) {
        if (session.process) {
          session.process.kill();
        }
        terminalSessions.delete(sessionId);
        socket.emit('terminal:stopped');
      }
    });

    socket.on('disconnect', () => {
      console.log('Terminal socket disconnected:', socket.id);
      // Clean up any sessions associated with this socket
      const sessionsToClean = Array.from(terminalSessions.entries());
      for (const [sessionId, session] of sessionsToClean) {
        if (session.process) {
          session.process.kill();
        }
        terminalSessions.delete(sessionId);
      }
    });
  });
}