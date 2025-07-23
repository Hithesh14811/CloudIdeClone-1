import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { Server as SocketIOServer } from 'socket.io';
import { setupTerminalSocket } from './sockets/terminal';
import { setupPreviewSocket } from './sockets/preview';
import { 
  generalRateLimit, 
  securityHeaders, 
  corsConfig, 
  requestLogger, 
  sanitizeErrorResponse,
  healthCheck
} from './middleware/security';
import { storage } from './storage';
import { dockerService } from './services/docker';
import { fileSyncRegistry } from './services/fileSync';

const app = express();

// Trust proxy for accurate IP addresses behind load balancers
app.set('trust proxy', 1);

// Security middleware - applied first
app.use(securityHeaders);
app.use(corsConfig);

// Request parsing middleware
app.use(express.json({ limit: '10mb' })); // Limit payload size
app.use(express.urlencoded({ extended: false, limit: '10mb' }));

// Rate limiting - applied early
app.use(generalRateLimit);

// Request logging
app.use(requestLogger);

// Request ID middleware for tracing
app.use((req: Request, res: Response, next: NextFunction) => {
  req.headers['x-request-id'] = req.headers['x-request-id'] || 
    `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  res.setHeader('X-Request-ID', req.headers['x-request-id'] as string);
  next();
});

// Health check endpoint (before auth)
app.get('/api/health', healthCheck);

// Startup sequence with comprehensive error handling
(async () => {
  console.log('🚀 Starting Shetty IDE server...');
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Node version: ${process.version}`);
  
  // Validate required environment variables
  const requiredEnvVars = ['DATABASE_URL', 'SESSION_SECRET'];
  const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
  
  if (missingEnvVars.length > 0) {
    console.error('❌ Missing required environment variables:', missingEnvVars.join(', '));
    console.error('Please check your .env file or environment configuration');
    process.exit(1);
  }
  
  // Test database connection with retry logic
  let dbConnected = false;
  let dbRetries = 3;
  
  while (!dbConnected && dbRetries > 0) {
    try {
      const { storage } = await import('./storage');
      const healthCheck = await storage.healthCheck();
      
      if (healthCheck.status === 'healthy') {
        console.log(`✅ Database connection established (${healthCheck.latency}ms)`);
        dbConnected = true;
      } else {
        throw new Error('Database health check failed');
      }
    } catch (error) {
      dbRetries--;
      console.error(`❌ Database connection failed (${dbRetries} retries left):`, error);
      
      if (dbRetries === 0) {
        console.error('❌ Could not establish database connection after retries');
        console.log('Continuing startup without database connection...');
        console.log('Some features may not work properly');
      } else {
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }
  
  // Test Docker availability (non-blocking)
  try {
    const { dockerService } = await import('./services/docker');
    const dockerHealth = await dockerService.healthCheck();
    
    if (dockerHealth.dockerAvailable) {
      console.log('✅ Docker is available for secure terminal execution');
    } else {
      console.log('⚠️  Docker not available - using restricted direct execution');
    }
  } catch (error) {
    console.log('⚠️  Docker service check failed - using fallback execution');
  }
  
  let server;
  
  try {
    // Register application routes
    server = await registerRoutes(app);
    console.log('✅ Application routes registered');
  } catch (error) {
    console.error('❌ Failed to register routes:', error);
    process.exit(1);
  }
  
  // Socket.IO setup with proper terminal integration
  const io = new SocketIOServer(server, {
    cors: {
      origin: process.env.CLIENT_URL || "http://localhost:5173",
      methods: ["GET", "POST"],
      credentials: true
    },
    transports: ['websocket', 'polling']
  });

  // Store global IO instance for services
  let globalIO: SocketIOServer;

  // Enhanced Socket.IO connection handling
  io.on('connection', (socket) => {
    console.log('Socket connected:', socket.id);
    
    // Terminal functionality with Docker integration
    socket.on('terminal:start', async (data: { projectId: string, userId: string }) => {
      try {
        const { projectId, userId } = data;
        console.log(`Starting terminal for project ${projectId}, user ${userId}`);
        
        // Get project files for Docker container
        const files = await storage.getProjectFiles(parseInt(projectId));
        
        // Create Docker container session
        const containerSession = await dockerService.createContainer(projectId, userId, files);
        
        // Set up file sync for real-time updates
        const workspaceDir = containerSession.workingDir;
        const fileSync = fileSyncRegistry.getOrCreate(parseInt(projectId), workspaceDir, io);
        
        // Emit ready event with session details
        socket.emit('terminal:ready', {
          sessionId: containerSession.id,
          cols: 80,
          rows: 24,
          workingDir: workspaceDir
        });
        
        // Join project room for file updates
        socket.join(`project-${projectId}`);
        
      } catch (error) {
        console.error('Terminal start error:', error);
        socket.emit('terminal:error', { 
          message: error.message || 'Failed to start terminal' 
        });
      }
    });

    socket.on('terminal:input', async (data: { sessionId: string, input: string }) => {
      try {
        const { sessionId, input } = data;
        
        // Get container session
        const session = dockerService.getSession(sessionId);
        if (!session) {
          socket.emit('terminal:error', { message: 'Terminal session not found' });
          return;
        }
        
        // Execute command in Docker container
        const childProcess = await dockerService.executeCommand(sessionId, input);
        
        // Stream output to client
        childProcess.stdout?.on('data', (data) => {
          socket.emit('terminal:output', data.toString());
        });
        
        childProcess.stderr?.on('data', (data) => {
          socket.emit('terminal:output', data.toString());
        });
        
        childProcess.on('exit', (code) => {
          socket.emit('terminal:exit', { code: code || 0 });
          
          // Trigger file sync after command execution
          const fileSync = fileSyncRegistry.get(parseInt(session.projectId));
          if (fileSync) {
            fileSync.syncWorkspaceToDatabase().catch(console.error);
          }
        });
        
      } catch (error) {
        console.error('Terminal input error:', error);
        socket.emit('terminal:error', { 
          message: error.message || 'Command execution failed' 
        });
      }
    });

    socket.on('terminal:resize', (data: { sessionId: string, cols: number, rows: number }) => {
      try {
        const { sessionId, cols, rows } = data;
        // Docker containers handle resize differently - log for now
        console.log(`Terminal resize for ${sessionId}: ${cols}x${rows}`);
      } catch (error) {
        console.error('Terminal resize error:', error);
      }
    });

    socket.on('terminal:stop', async (data: { sessionId: string }) => {
      try {
        const { sessionId } = data;
        await dockerService.destroyContainer(sessionId);
        socket.emit('terminal:stopped');
      } catch (error) {
        console.error('Terminal stop error:', error);
      }
    });

    // File operations with real-time sync
    socket.on('file:create', async (data: { projectId: string, name: string, type: string, parentId?: number, content?: string }) => {
      try {
        const file = await storage.createFile({
          ...data,
          projectId: parseInt(data.projectId)
        });
        
        // Trigger file sync
        const fileSync = fileSyncRegistry.get(parseInt(data.projectId));
        if (fileSync) {
          fileSync.emitFileEvent('create', file.path, { fileId: file.id });
        }
        
        socket.emit('file:created', file);
        io.to(`project-${data.projectId}`).emit('file-tree-update', { projectId: data.projectId });
        
      } catch (error) {
        console.error('File create error:', error);
        socket.emit('file:error', { message: 'Failed to create file' });
      }
    });

    socket.on('file:update', async (data: { fileId: number, content: string, projectId: string }) => {
      try {
        await storage.updateFile(data.fileId, { content: data.content });
        
        // Trigger file sync
        const fileSync = fileSyncRegistry.get(parseInt(data.projectId));
        if (fileSync) {
          const file = await storage.getFile(data.fileId);
          if (file) {
            fileSync.emitFileEvent('update', file.path, { fileId: file.id });
          }
        }
        
        socket.emit('file:updated', { fileId: data.fileId });
        io.to(`project-${data.projectId}`).emit('file-tree-update', { projectId: data.projectId });
        
      } catch (error) {
        console.error('File update error:', error);
        socket.emit('file:error', { message: 'Failed to update file' });
      }
    });

    socket.on('file:delete', async (data: { fileId: number, projectId: string }) => {
      try {
        const file = await storage.getFile(data.fileId);
        if (file) {
          // Mark as deleted in file sync
          const fileSync = fileSyncRegistry.get(parseInt(data.projectId));
          if (fileSync) {
            fileSync.markAsDeleted(file.path);
          }
          
          await storage.deleteFile(data.fileId);
          
          socket.emit('file:deleted', { fileId: data.fileId });
          io.to(`project-${data.projectId}`).emit('file-tree-update', { projectId: data.projectId });
        }
      } catch (error) {
        console.error('File delete error:', error);
        socket.emit('file:error', { message: 'Failed to delete file' });
      }
    });

    // Project room management
    socket.on('join-project', (data: { projectId: string }) => {
      socket.join(`project-${data.projectId}`);
      console.log(`Socket ${socket.id} joined project ${data.projectId}`);
    });

    socket.on('leave-project', (data: { projectId: string }) => {
      socket.leave(`project-${data.projectId}`);
      console.log(`Socket ${socket.id} left project ${data.projectId}`);
    });

    // Disconnect cleanup
    socket.on('disconnect', () => {
      console.log('Socket disconnected:', socket.id);
      // Cleanup any active terminal sessions for this socket
      const sessions = dockerService.getAllSessions();
      for (const session of sessions) {
        // Note: In production, you'd want to associate sessions with socket IDs
        // For now, sessions will be cleaned up by the timeout mechanism
      }
    });
  });

  // Store global IO reference
  globalIO = io;
  
  // Socket.IO middleware for authentication
  io.use(async (socket, next) => {
    try {
      // Basic socket authentication - you might want to enhance this
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization;
      
      if (!token && process.env.NODE_ENV === 'production') {
        return next(new Error('Authentication required'));
      }
      
      next();
    } catch (error) {
      console.error('Socket authentication error:', error);
      next(new Error('Authentication failed'));
    }
  });
  
  // Setup socket handlers
  try {
    setupTerminalSocket(io);
    setupPreviewSocket(io);
    console.log('✅ Socket.IO handlers configured');
  } catch (error) {
    console.error('❌ Failed to setup socket handlers:', error);
  }
  
  // Set global IO instance for routes to emit real-time events
  const { setGlobalIO } = await import('./routes');
  setGlobalIO(io);
  
  // Global error handler (must be last middleware)
  app.use(sanitizeErrorResponse);
  
  // 404 handler for API routes
  app.use('/api/*', (req: Request, res: Response) => {
    res.status(404).json({
      error: 'API endpoint not found',
      path: req.path,
      method: req.method,
      timestamp: new Date().toISOString()
    });
  });
  
  // Setup Vite in development or serve static files in production
  if (app.get("env") === "development") {
    try {
      await setupVite(app, server);
      console.log('✅ Vite development server configured');
    } catch (error) {
      console.error('❌ Failed to setup Vite:', error);
    }
  } else {
    try {
      serveStatic(app);
      console.log('✅ Static file serving configured');
    } catch (error) {
      console.error('❌ Failed to setup static serving:', error);
    }
  }
  
  // Get port from environment with fallback
  const port = parseInt(process.env.PORT || '5000', 10);
  
  if (isNaN(port) || port < 1 || port > 65535) {
    console.error('❌ Invalid port number:', process.env.PORT);
    process.exit(1);
  }
  
  // Start server
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    console.log(`🎉 Shetty IDE server running on port ${port}`);
    console.log(`📊 Health check: http://localhost:${port}/api/health`);
    console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔒 Security: Rate limiting, CORS, and headers configured`);
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`🔧 Development mode: Hot reload enabled`);
    }
  });
  
  // Graceful shutdown handling
  const gracefulShutdown = async (signal: string) => {
    console.log(`\n📡 Received ${signal}, starting graceful shutdown...`);
    
    // Stop accepting new connections
    server.close(async () => {
      console.log('✅ HTTP server closed');
      
      try {
        // Close Socket.IO connections
        io.close(() => {
          console.log('✅ Socket.IO server closed');
        });
        
        // Cleanup Docker sessions
        const { dockerService } = await import('./services/docker');
        const sessions = dockerService.getAllSessions();
        if (sessions.length > 0) {
          console.log(`🧹 Cleaning up ${sessions.length} Docker sessions...`);
          for (const session of sessions) {
            await dockerService.destroyContainer(session.id);
          }
        }
        
        // Cleanup file sync instances
        const { fileSyncRegistry } = await import('./services/fileSync');
        fileSyncRegistry.cleanup();
        console.log('✅ File sync instances cleaned up');
        
        console.log('✅ Graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        console.error('❌ Error during shutdown:', error);
        process.exit(1);
      }
    });
    
    // Force shutdown after timeout
    setTimeout(() => {
      console.error('❌ Forced shutdown due to timeout');
      process.exit(1);
    }, 30000); // 30 seconds timeout
  };
  
  // Handle shutdown signals
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  
  // Handle uncaught exceptions and rejections
  process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    gracefulShutdown('uncaughtException');
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    gracefulShutdown('unhandledRejection');
  });
  
})().catch((error) => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});
