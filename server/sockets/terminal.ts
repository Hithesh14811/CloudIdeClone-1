import { Server as SocketIOServer } from 'socket.io';
import * as pty from 'node-pty';
import { storage } from '../storage';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { platform } from 'os';
import { execSync } from 'child_process';

interface TerminalSession {
  id: string;
  projectId: string;
  userId: string;
  workingDir: string;
  ptyProcess: pty.IPty;
  socketId: string;
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
        
        // Determine shell based on platform and availability
        let shell = 'sh'; // Default fallback
        let args: string[] = [];
        
        if (platform() === 'win32') {
          shell = 'powershell.exe';
          args = [];
        } else {
          // Try to find the best shell
          try {
            execSync('which bash', { stdio: 'ignore' });
            shell = 'bash';
          } catch {
            try {
              execSync('which sh', { stdio: 'ignore' });
              shell = 'sh';
            } catch {
              throw new Error('No shell found');
            }
          }
        }

        console.log(`Starting terminal with shell: ${shell}`);

        // Create PTY process with error handling
        let ptyProcess;
        try {
          // Use minimal args to avoid shell configuration issues
          if (shell === 'bash') {
            args = []; // Let bash use default behavior
          } else if (shell === 'sh') {
            args = []; // Let sh use default behavior
          }

          ptyProcess = pty.spawn(shell, args, {
            name: 'xterm-color',
            cols: 80,
            rows: 24,
            cwd: workingDir,
            env: {
              ...process.env,
              TERM: 'xterm-256color',
              PATH: process.env.PATH,
              HOME: workingDir,
              SHELL: shell,
              USER: 'user',
              PWD: workingDir,
              NODE_ENV: 'development',
            }
          });

          console.log(`PTY process started with PID: ${ptyProcess.pid}`);
        } catch (spawnError) {
          console.error('Failed to spawn PTY process:', spawnError);
          socket.emit('terminal:error', { message: `Failed to start shell: ${shell}` });
          return;
        }

        const session: TerminalSession = {
          id: sessionId,
          projectId,
          userId,
          workingDir,
          ptyProcess,
          socketId: socket.id
        };
        
        terminalSessions.set(sessionId, session);

        // Handle PTY output
        ptyProcess.onData((data) => {
          socket.emit('terminal:output', data);
        });

        // Handle PTY exit
        ptyProcess.onExit((exitCode) => {
          const code = typeof exitCode === 'object' ? exitCode.exitCode : exitCode;
          console.log(`Terminal ${sessionId} exited with code ${code}`);
          socket.emit('terminal:exit', { code: code || 0 });
          terminalSessions.delete(sessionId);
        });

        // Wait a moment for the shell to initialize before sending ready
        setTimeout(() => {
          socket.emit('terminal:ready', { sessionId, cols: 80, rows: 24 });
        }, 500);
      } catch (error) {
        console.error('Error starting terminal:', error);
        socket.emit('terminal:error', { message: 'Failed to start terminal' });
      }
    });

    socket.on('terminal:input', (data: { sessionId: string, input: string }) => {
      try {
        const { sessionId, input } = data;
        const session = terminalSessions.get(sessionId);
        
        if (!session) {
          socket.emit('terminal:error', { message: 'No active terminal session' });
          return;
        }

        // Write input to PTY
        session.ptyProcess.write(input);
      } catch (error) {
        console.error('Error sending input to terminal:', error);
        socket.emit('terminal:error', { message: 'Failed to send input' });
      }
    });

    socket.on('terminal:resize', (data: { sessionId: string, cols: number, rows: number }) => {
      try {
        const { sessionId, cols, rows } = data;
        const session = terminalSessions.get(sessionId);
        
        if (!session) {
          socket.emit('terminal:error', { message: 'No active terminal session' });
          return;
        }

        // Resize PTY
        session.ptyProcess.resize(cols, rows);
      } catch (error) {
        console.error('Error resizing terminal:', error);
        socket.emit('terminal:error', { message: 'Failed to resize terminal' });
      }
    });

    socket.on('terminal:stop', (data: { sessionId: string }) => {
      try {
        const { sessionId } = data;
        const session = terminalSessions.get(sessionId);
        
        if (session) {
          session.ptyProcess.kill();
          terminalSessions.delete(sessionId);
          socket.emit('terminal:stopped', { sessionId });
        }
      } catch (error) {
        console.error('Error stopping terminal:', error);
        socket.emit('terminal:error', { message: 'Failed to stop terminal' });
      }
    });

    socket.on('disconnect', () => {
      console.log('Terminal socket disconnected:', socket.id);
      
      // Clean up any terminal sessions for this socket
      Array.from(terminalSessions.entries()).forEach(([sessionId, session]) => {
        if (session.socketId === socket.id) {
          session.ptyProcess.kill();
          terminalSessions.delete(sessionId);
          console.log(`Cleaned up terminal session: ${sessionId}`);
        }
      });
    });
  });
}