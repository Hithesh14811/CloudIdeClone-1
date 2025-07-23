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

  constructor(socket: Socket, watchPath: string, projectId: string) {
    this.socket = socket;
    this.watchPath = watchPath;
    this.projectId = projectId;
  }

  start() {
    if (this.watcher) {
      this.stop();
    }

    // Watch the directory for changes with progressive file creation support
    this.watcher = chokidar.watch(this.watchPath, {
      ignored: [
        /(^|[\/\\])\../, // ignore dotfiles but allow .gitignore
        '!**/.gitignore', // allow .gitignore files  
        '**/node_modules/**/node_modules/**', // ignore nested node_modules only
        '**/\.git/**', // ignore git
        '**/*~', // ignore temp files
        '**/tmp/**', // ignore tmp directories
        '**/*.tmp', // ignore tmp files
        '**/coverage/**', // ignore coverage
        '**/.next/**', // ignore Next.js build
        '**/.nuxt/**', // ignore Nuxt build
        '**/*.log', // ignore log files
        '**/logs/**', // ignore log directories
        '**/.cache/**', // ignore cache directories
        '**/vendor/**', // ignore vendor directories
      ],
      persistent: true,
      ignoreInitial: true, // Don't scan initial files
      depth: 10, // Optimized depth for performance vs visibility
      awaitWriteFinish: {
        stabilityThreshold: 10, // Even faster detection for create-react-app
        pollInterval: 3 // Ultra-fast polling for immediate detection
      },
      followSymlinks: false,
      ignorePermissionErrors: true,
      atomic: true,
      usePolling: false, // Use native file system events for maximum speed
      interval: 50, // Faster fallback polling
      binaryInterval: 200, // Faster binary file detection
      alwaysStat: false // Don't stat files unless needed
    });

    // Send initial file tree
    setTimeout(() => {
      this.sendFileTreeUpdate();
    }, 100);

    // Listen for changes with immediate socket emissions for instant progressive updates
    let updateTimeout: NodeJS.Timeout | null = null;
    const immediateUpdate = (eventType: string, filePath: string) => {
      // Emit immediate socket event for instant UI updates
      this.socket.emit('files:updated', { 
        projectId: this.projectId,
        eventType,
        filePath,
        timestamp: Date.now()
      });

      // Also schedule background database sync with minimal delay
      if (updateTimeout) clearTimeout(updateTimeout);
      updateTimeout = setTimeout(() => {
        this.sendFileTreeUpdate();
        updateTimeout = null;
      }, 5); // 5ms for ultra-fast progressive updates
    };

    this.watcher
      .on('add', (path) => {
        console.log('File added:', path);
        immediateUpdate('add', path);
      })
      .on('addDir', (path) => {
        console.log('Directory added:', path);
        immediateUpdate('addDir', path);
      })
      .on('change', (path) => {
        console.log('File changed:', path);
        immediateUpdate('change', path);
      })
      .on('unlink', (path) => {
        console.log('File removed:', path);
        immediateUpdate('unlink', path);
      })
      .on('unlinkDir', (path) => {
        console.log('Directory removed:', path);
        immediateUpdate('unlinkDir', path);
      })
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
        this.socket.emit('file-tree-update', {
          projectId: this.projectId,
          tree: tree.children || []
        });
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

      // Filter out problematic items (but allow node_modules folder itself)
      const filteredItems = items.filter(item => {
        // Skip hidden files and directories
        if (item.startsWith('.')) return false;

        // Allow node_modules folder itself (but we won't recurse into it deeply)
        // This will show node_modules as a single folder in the tree
        if (item === 'node_modules') return true;

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
        
        // Special handling for node_modules - show as folder but don't recurse deeply
        if (folder === 'node_modules') {
          tree.children!.push({
            name: folder,
            type: 'folder',
            path: folderRelativePath,
            children: [] // Empty children to avoid deep recursion
          });
        } else {
          const subtree = this.buildFileTree(folderPath, folderRelativePath);
          if (subtree) {
            tree.children!.push(subtree);
          }
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