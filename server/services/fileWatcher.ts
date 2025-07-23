import chokidar from 'chokidar';
import { Socket } from 'socket.io';
import { join } from 'path';
import { existsSync } from 'fs';

export class FileWatcher {
  private watcher: chokidar.FSWatcher | null = null;
  private socket: Socket;
  private watchPath: string;
  private projectId: string;
  private isWatching = false;

  constructor(socket: Socket, watchPath: string, projectId: string) {
    this.socket = socket;
    this.watchPath = watchPath;
    this.projectId = projectId;
  }

  start() {
    if (this.watcher || !existsSync(this.watchPath)) {
      return;
    }

    console.log(`Starting file watcher for project ${this.projectId} at ${this.watchPath}`);

    this.watcher = chokidar.watch(this.watchPath, {
      ignored: [
        /(^|[\/\\])\../, // ignore dotfiles
        '**/node_modules/**',
        '**/\.git/**',
        '**/*~',
        '**/tmp/**',
        '**/*.tmp',
        '**/coverage/**',
        '**/.next/**',
        '**/.nuxt/**',
        '**/*.log',
        '**/logs/**',
        '**/.cache/**',
        '**/vendor/**',
      ],
      persistent: true,
      ignoreInitial: true,
      depth: 15,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 25
      },
      followSymlinks: false,
      ignorePermissionErrors: true,
      atomic: true,
      usePolling: false,
      interval: 100,
      binaryInterval: 500,
      alwaysStat: false
    });

    // File change events
    this.watcher.on('add', (filePath) => {
      this.emitFileChange('add', filePath);
    });

    this.watcher.on('change', (filePath) => {
      this.emitFileChange('change', filePath);
    });

    this.watcher.on('unlink', (filePath) => {
      this.emitFileChange('unlink', filePath);
    });

    this.watcher.on('addDir', (dirPath) => {
      this.emitFileChange('addDir', dirPath);
    });

    this.watcher.on('unlinkDir', (dirPath) => {
      this.emitFileChange('unlinkDir', dirPath);
    });

    this.watcher.on('error', (error) => {
      console.error(`File watcher error for project ${this.projectId}:`, error);
    });

    this.isWatching = true;
    console.log(`File watcher started for project ${this.projectId}`);
  }

  private emitFileChange(eventType: string, filePath: string) {
    const relativePath = filePath.replace(this.watchPath, '').replace(/^[\/\\]/, '');
    
    console.log(`File ${eventType}: ${relativePath} in project ${this.projectId}`);
    
    // Emit to the specific socket
    this.socket.emit('file-change', {
      projectId: this.projectId,
      eventType,
      filePath: relativePath,
      timestamp: new Date().toISOString()
    });

    // Also emit file tree update
    this.socket.emit('file-tree-update', {
      projectId: this.projectId,
      timestamp: new Date().toISOString()
    });
  }

  stop() {
    if (this.watcher) {
      console.log(`Stopping file watcher for project ${this.projectId}`);
      this.watcher.close();
      this.watcher = null;
      this.isWatching = false;
    }
  }

  isActive(): boolean {
    return this.isWatching && this.watcher !== null;
  }
}