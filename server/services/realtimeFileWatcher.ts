import * as chokidar from 'chokidar';
import * as fs from 'fs';
import * as path from 'path';
import { Socket } from 'socket.io';

interface FileTreeNode {
  name: string;
  type: 'file' | 'folder';
  path: string;
  children?: FileTreeNode[];
}

export class RealtimeFileWatcher {
  private watcher: chokidar.FSWatcher | null = null;
  private socket: Socket;
  private projectRoot: string;
  private projectId: string;

  constructor(socket: Socket, projectRoot: string, projectId: string) {
    this.socket = socket;
    this.projectRoot = projectRoot;
    this.projectId = projectId;
  }

  start() {
    if (this.watcher) {
      this.stop();
    }

    // Create the project root directory if it doesn't exist
    if (!fs.existsSync(this.projectRoot)) {
      fs.mkdirSync(this.projectRoot, { recursive: true });
    }

    console.log(`Starting realtime file watcher for project ${this.projectId} at ${this.projectRoot}`);

    // Setup chokidar with deep watching
    this.watcher = chokidar.watch(this.projectRoot, {
      persistent: true,
      ignoreInitial: false,
      depth: Infinity,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100
      },
      ignored: [
        '**/node_modules/**',
        '**/.git/**',
        '**/dist/**',
        '**/build/**',
        '**/.cache/**',
        '**/tmp/**',
        '**/*.log'
      ]
    });

    // Emit updated tree on any file system change
    const emitUpdatedTree = () => {
      const tree = this.buildTree(this.projectRoot);
      this.socket.emit('file-tree-update', {
        type: 'file-tree-update',
        projectId: this.projectId,
        tree
      });
      console.log(`Emitted file tree update for project ${this.projectId}`);
    };

    // Listen to all file system events
    this.watcher.on('all', (event, filePath) => {
      console.log('Filesystem changed:', event, filePath);
      emitUpdatedTree();
    });

    this.watcher.on('error', (error) => {
      console.error('File watcher error:', error);
    });

    // Send initial tree
    setTimeout(() => {
      emitUpdatedTree();
    }, 100);
  }

  stop() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
      console.log(`Realtime file watcher stopped for project ${this.projectId}`);
    }
  }

  private buildTree(dir: string, relativePath: string = ''): FileTreeNode | null {
    try {
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

      const items = fs.readdirSync(dir);
      
      for (const item of items) {
        const itemPath = path.join(dir, item);
        const itemRelativePath = relativePath ? `${relativePath}/${item}` : `/${item}`;
        
        try {
          const itemStats = fs.lstatSync(itemPath);
          
          if (itemStats.isDirectory()) {
            const subtree = this.buildTree(itemPath, itemRelativePath);
            if (subtree) {
              tree.children!.push(subtree);
            }
          } else {
            tree.children!.push({
              name: item,
              type: 'file',
              path: itemRelativePath
            });
          }
        } catch (error) {
          // Skip files that can't be read
          console.warn(`Cannot read file ${itemPath}:`, error);
        }
      }

      // Sort children: folders first, then files, both alphabetically
      tree.children!.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'folder' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });

      return tree;
    } catch (error) {
      console.error('Error building tree for', dir, error);
      return null;
    }
  }
}

export function setupRealtimeWatcher(socket: Socket, projectRoot: string, projectId: string): RealtimeFileWatcher {
  const watcher = new RealtimeFileWatcher(socket, projectRoot, projectId);
  
  // Cleanup on socket disconnect
  socket.on('disconnect', () => {
    watcher.stop();
  });
  
  return watcher;
}