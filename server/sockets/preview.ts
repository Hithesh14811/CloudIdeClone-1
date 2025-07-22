import { Server as SocketIOServer } from 'socket.io';
import { previewService } from '../services/preview';

interface PreviewSession {
  projectId: string;
  userId: string;
  previewUrl: string;
  startTime: Date;
}

const previewSessions = new Map<string, PreviewSession>();

export function setupPreviewSocket(io: SocketIOServer) {
  io.on('connection', (socket) => {
    console.log('Preview socket connected:', socket.id);

    socket.on('preview:start', async (data: { projectId: string, userId: string }) => {
      try {
        const { projectId, userId } = data;
        
        // Create preview session using the preview service
        const session = await previewService.createPreviewSession(projectId, userId);
        
        previewSessions.set(session.id, {
          projectId,
          userId,
          previewUrl: session.previewUrl,
          startTime: new Date()
        });

        socket.emit('preview:ready', { sessionId: session.id, previewUrl: session.previewUrl });
        console.log(`Started preview server for project ${projectId} on port ${session.port}`);
      } catch (error) {
        console.error('Error starting preview:', error);
        socket.emit('preview:error', { message: 'Failed to start preview server' });
      }
    });

    socket.on('preview:refresh', async (data: { sessionId: string }) => {
      try {
        const { sessionId } = data;
        const session = previewSessions.get(sessionId);
        
        if (!session) {
          socket.emit('preview:error', { message: 'No active preview session' });
          return;
        }

        // Refresh the preview session files
        await previewService.refreshPreviewSession(sessionId);
        
        // Trigger preview refresh
        socket.emit('preview:refreshed', { 
          previewUrl: session.previewUrl + '?t=' + Date.now(),
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('Error refreshing preview:', error);
        socket.emit('preview:error', { message: 'Failed to refresh preview' });
      }
    });

    socket.on('preview:stop', async (data: { sessionId: string }) => {
      try {
        const { sessionId } = data;
        const session = previewSessions.get(sessionId);
        
        if (session) {
          await previewService.destroyPreviewSession(sessionId);
          previewSessions.delete(sessionId);
          socket.emit('preview:stopped');
        }
      } catch (error) {
        console.error('Error stopping preview:', error);
        socket.emit('preview:error', { message: 'Failed to stop preview server' });
      }
    });

    socket.on('preview:file-changed', async (data: { sessionId: string, filePath: string, content: string }) => {
      try {
        const { sessionId, filePath, content } = data;
        const session = previewSessions.get(sessionId);
        
        if (session && session.port) {
          // File change detected, trigger live reload
          socket.emit('preview:live-reload', { 
            filePath,
            timestamp: new Date().toISOString()
          });
        }
      } catch (error) {
        console.error('Error handling file change:', error);
      }
    });

    socket.on('disconnect', () => {
      console.log('Preview socket disconnected:', socket.id);
      // Clean up any preview sessions associated with this socket
      for (const [sessionId, session] of previewSessions.entries()) {
        if (session.serverId) {
          stopPreviewServer(session.serverId).catch(console.error);
        }
        previewSessions.delete(sessionId);
      }
    });
  });
}