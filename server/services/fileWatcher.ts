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
      ignored: /(^|[\/\\])\../, // ignore dotfiles
      persistent: true,
      ignoreInitial: false,
      depth: undefined,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50
      }
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
      const stats = fs.statSync(dir);
      if (!stats.isDirectory()) return null;

      const name = path.basename(dir);
      const tree: FileTreeNode = {
        name: name || 'root',
        type: 'folder',
        path: relativePath,
        children: []
      };

      const items = fs.readdirSync(dir);
      
      // Separate files and folders
      const folders: string[] = [];
      const files: string[] = [];

      for (const item of items) {
        const itemPath = path.join(dir, item);
        const stat = fs.statSync(itemPath);
        
        if (stat.isDirectory()) {
          folders.push(item);
        } else {
          files.push(item);
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