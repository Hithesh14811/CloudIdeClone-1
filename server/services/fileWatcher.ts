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

    // Watch the directory for changes
    this.watcher = chokidar.watch(this.watchPath, {
      ignored: [
        /(^|[\/\\])\../, // ignore dotfiles
        '**/node_modules/**', // ignore node_modules
        '**/\.git/**', // ignore git
        '**/*~', // ignore temp files
        '**/tmp/**', // ignore tmp directories
        '**/*.tmp', // ignore tmp files
        '**/dist/**', // ignore build directories
        '**/build/**' // ignore build directories
      ],
      persistent: true,
      ignoreInitial: false,
      depth: 10, // Limit depth to avoid infinite recursion
      awaitWriteFinish: {
        stabilityThreshold: 200,
        pollInterval: 100
      },
      followSymlinks: false, // Don't follow symlinks
      ignorePermissionErrors: true, // Ignore permission errors
      atomic: true // Treat moves as atomic
    });

    // Send initial file tree
    setTimeout(() => {
      this.sendFileTreeUpdate();
    }, 100);

    // Listen for changes
    this.watcher
      .on('add', () => this.sendFileTreeUpdate())
      .on('addDir', () => this.sendFileTreeUpdate())
      .on('change', () => this.sendFileTreeUpdate())
      .on('unlink', () => this.sendFileTreeUpdate())
      .on('unlinkDir', () => this.sendFileTreeUpdate())
      .on('error', (error) => {
        console.error('File watcher error:', error);
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

  private sendFileTreeUpdate() {
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