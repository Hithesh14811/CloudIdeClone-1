import * as chokidar from 'chokidar';
import * as fs from 'fs';
import * as path from 'path';
import { Socket } from 'socket.io';

export interface FileTreeNode {
  name: string;
  type: 'file' | 'folder';
  path: string;
  children?: FileTreeNode[];
}

export class FileWatcher {
  private watcher: chokidar.FSWatcher | null = null;
  private socket: Socket;
  private watchPath: string;
  private projectId: string;
  private io?: any; // Socket.IO server instance

  constructor(socket: Socket, watchPath: string, projectId: string, io?: any) {
    this.socket = socket;
    this.watchPath = watchPath;
    this.projectId = projectId;
    this.io = io;
  }

  start() {
    if (this.watcher) {
      this.stop();
    }

    // Watch the directory for changes with aggressive filtering to avoid system limits
    this.watcher = chokidar.watch(this.watchPath, {
      ignored: [
        /(^|[\/\\])\../, // ignore dotfiles
        '**/node_modules/**', // ignore node_modules completely
        '**/\.git/**', // ignore git
        '**/*~', // ignore temp files
        '**/tmp/**', // ignore tmp directories
        '**/*.tmp', // ignore tmp files
        '**/dist/**', // ignore build directories
        '**/build/**', // ignore build directories
        '**/coverage/**', // ignore coverage
        '**/.next/**', // ignore Next.js build
        '**/.nuxt/**', // ignore Nuxt build
        '**/out/**', // ignore output directories
        '**/*.log', // ignore log files
        '**/logs/**', // ignore log directories
        '**/.cache/**', // ignore cache directories
        '**/vendor/**', // ignore vendor directories
        '**/public/static/**', // ignore static build assets
      ],
      persistent: true,
      ignoreInitial: true, // Don't scan initial files, reduces load
      depth: 5, // Limit depth more aggressively
      awaitWriteFinish: {
        stabilityThreshold: 200, // Faster detection of file operations
        pollInterval: 100
      },
      followSymlinks: false,
      ignorePermissionErrors: true,
      atomic: true,
      usePolling: false, // Use native file system events for better performance
      interval: 1000, // Polling interval if usePolling is true
      binaryInterval: 3000, // Polling for binary files
      alwaysStat: false // Don't stat files unless needed
    });

    // Send initial file tree
    setTimeout(() => {
      this.sendFileTreeUpdate();
    }, 100);

    // Listen for changes with throttling to prevent spam
    let updateTimeout: NodeJS.Timeout | null = null;
    const throttledUpdate = () => {
      if (updateTimeout) clearTimeout(updateTimeout);
      updateTimeout = setTimeout(() => {
        this.sendFileTreeUpdate();
        updateTimeout = null;
      }, 100); // Faster throttling for real-time updates - max every 100ms
    };

    this.watcher
      .on('add', throttledUpdate)
      .on('addDir', throttledUpdate)
      .on('change', throttledUpdate)
      .on('unlink', throttledUpdate)
      .on('unlinkDir', throttledUpdate)
      .on('error', (error: any) => {
        // Handle ENOSPC errors gracefully
        if (error?.code === 'ENOSPC') {
          console.warn('File watcher limit reached, trying to continue with reduced watching');
          // Don't crash, just log and continue
        } else {
          console.error('File watcher error:', error);
        }
      });

    console.log(`File watcher started for project ${this.projectId} at ${this.watchPath}`);
  }

  stop() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
      console.log(`File watcher stopped for project ${this.projectId}`);
    }
  }

  sendFileTreeUpdate() {
    try {
      const tree = this.buildFileTree(this.watchPath);
      if (tree) {
        const updateData = {
          projectId: this.projectId,
          tree: tree.children || []
        };
        
        // Emit to all clients if io is available, otherwise fall back to single socket
        if (this.io) {
          this.io.emit('file-tree-update', updateData);
          this.io.emit('files:changed', { projectId: parseInt(this.projectId) });
        } else {
          this.socket.emit('file-tree-update', updateData);
          this.socket.emit('files:changed', { projectId: parseInt(this.projectId) });
        }
      }
    } catch (error) {
      console.error('Error building file tree:', error);
    }
  }

  // Manual refresh method for when automatic updates fail
  forceRefresh() {
    console.log(`Force refreshing file tree for project ${this.projectId}`);
    this.sendFileTreeUpdate();
  }

  private buildFileTree(dir: string, relativePath: string = ''): FileTreeNode | null {
    try {
      // Check if directory exists and is accessible
      if (!fs.existsSync(dir)) {
        return null;
      }
      
      const stats = fs.lstatSync(dir);
      if (!stats.isDirectory()) return null;

      const name = path.basename(dir);
      const tree: FileTreeNode = {
        name: name || 'root',
        type: 'folder',
        path: relativePath,
        children: []
      };

      let items: string[] = [];
      try {
        items = fs.readdirSync(dir);
      } catch (error) {
        console.error(`Error reading directory ${dir}:`, error);
        return tree; // Return empty folder instead of null
      }
      
      // Filter out problematic items (node_modules, .git, tmp files, etc.)
      const filteredItems = items.filter(item => {
        // Skip hidden files and directories
        if (item.startsWith('.')) return false;
        
        // Skip node_modules to avoid symlink issues
        if (item === 'node_modules') return false;
        
        // Skip temporary files
        if (item.startsWith('tmp') || item.includes('~')) return false;
        
        return true;
      });
      
      // Separate files and folders with better error handling
      const folders: string[] = [];
      const files: string[] = [];

      for (const item of filteredItems) {
        const itemPath = path.join(dir, item);
        try {
          // Use lstat to handle symlinks properly
          if (!fs.existsSync(itemPath)) continue;
          
          const stat = fs.lstatSync(itemPath);
          
          // Skip symlinks to avoid broken link errors
          if (stat.isSymbolicLink()) continue;
          
          if (stat.isDirectory()) {
            folders.push(item);
          } else if (stat.isFile()) {
            files.push(item);
          }
        } catch (statError) {
          // Skip items that can't be accessed
          console.error(`Error accessing ${itemPath}:`, statError);
          continue;
        }
      }

      // Add folders first (sorted)
      folders.sort().forEach(folder => {
        const folderPath = path.join(dir, folder);
        const folderRelativePath = path.join(relativePath, folder);
        const subtree = this.buildFileTree(folderPath, folderRelativePath);
        if (subtree) {
          tree.children!.push(subtree);
        }
      });

      // Add files (sorted)
      files.sort().forEach(file => {
        const fileRelativePath = path.join(relativePath, file);
        tree.children!.push({
          name: file,
          type: 'file',
          path: fileRelativePath
        });
      });

      return tree;
    } catch (error) {
      console.error(`Error reading directory ${dir}:`, error);
      return null;
    }
  }
}