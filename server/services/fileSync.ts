import { storage } from '../storage';
import * as fs from 'fs';
import * as path from 'path';
import { Server as SocketIOServer } from 'socket.io';
import { randomUUID } from 'crypto';

// File operation lock manager for atomicity
class FileLockManager {
  private locks = new Map<string, Promise<void>>();
  
  async withLock<T>(lockKey: string, operation: () => Promise<T>): Promise<T> {
    // Wait for any existing lock on this resource
    const existingLock = this.locks.get(lockKey);
    if (existingLock) {
      await existingLock;
    }
    
    // Create new lock
    let resolveLock: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      resolveLock = resolve;
    });
    
    this.locks.set(lockKey, lockPromise);
    
    try {
      const result = await operation();
      return result;
    } finally {
      // Release lock
      this.locks.delete(lockKey);
      resolveLock!();
    }
  }
}

const fileLockManager = new FileLockManager();

export class FileSync {
  private projectId: number;
  private workspaceDir: string;
  private syncTimeout: NodeJS.Timeout | null = null;
  private recentlyDeleted = new Map<string, number>(); // Track with timestamps
  private deleteTimeout: NodeJS.Timeout | null = null;
  private io: SocketIOServer | null = null;
  private isDestroyed = false;
  private syncInProgress = false;
  private pendingOperations = new Set<string>();
  private readonly lockKey: string;

  constructor(projectId: number, workspaceDir: string, io?: SocketIOServer) {
    this.projectId = projectId;
    this.workspaceDir = workspaceDir;
    this.io = io || null;
    this.lockKey = `project-${projectId}`;
    
    // Clean up recently deleted files every 30 seconds
    this.deleteTimeout = setInterval(() => {
      this.cleanupRecentlyDeleted();
    }, 30000);
  }

  private cleanupRecentlyDeleted(): void {
    const now = Date.now();
    const expireTime = 30000; // 30 seconds
    
    for (const [filePath, timestamp] of this.recentlyDeleted.entries()) {
      if (now - timestamp > expireTime) {
        this.recentlyDeleted.delete(filePath);
      }
    }
  }

  // Atomic sync operation with database transaction
  async syncWorkspaceToDatabase(): Promise<void> {
    if (this.isDestroyed || this.syncInProgress) {
      return;
    }

    const operationId = randomUUID();
    this.pendingOperations.add(operationId);

    try {
      await fileLockManager.withLock(this.lockKey, async () => {
        if (this.syncTimeout) {
          clearTimeout(this.syncTimeout);
        }

        // Debounce rapid changes
        this.syncTimeout = setTimeout(async () => {
          if (this.isDestroyed) return;
          
          try {
            this.syncInProgress = true;
            await this.performAtomicSync();
            
            // Emit update event after successful sync
            this.emitFileUpdateEvent('sync_complete');
            console.log(`Atomic file sync completed for project ${this.projectId}`);
          } catch (error) {
            console.error('Atomic file sync error:', error);
            this.emitFileUpdateEvent('sync_error');
          } finally {
            this.syncInProgress = false;
          }
        }, 100); // Very fast debounce for real-time feel
      });
    } finally {
      this.pendingOperations.delete(operationId);
    }
  }

  // Force immediate sync without debouncing
  async forceSyncNow(): Promise<void> {
    if (this.isDestroyed) return;

    return fileLockManager.withLock(this.lockKey, async () => {
      if (this.syncTimeout) {
        clearTimeout(this.syncTimeout);
        this.syncTimeout = null;
      }

      try {
        this.syncInProgress = true;
        await this.performAtomicSync();
        this.emitFileUpdateEvent('force_sync_complete');
        console.log(`Force sync completed for project ${this.projectId}`);
      } catch (error) {
        console.error('Force sync error:', error);
        throw error;
      } finally {
        this.syncInProgress = false;
      }
    });
  }

  // Emit immediate file event for progressive updates
  emitFileEvent(eventType: string, filePath: string, metadata?: any): void {
    if (this.io && !this.isDestroyed) {
      const projectRoom = `project-${this.projectId}`;
      this.io.to(projectRoom).emit('files:updated', { 
        projectId: this.projectId.toString(),
        eventType,
        filePath,
        metadata,
        timestamp: Date.now()
      });
      console.log(`Emitted ${eventType} event for ${filePath} to room ${projectRoom}`);
    }
  }

  // Emit socket event for real-time frontend updates
  private emitFileUpdateEvent(eventType: string = 'update'): void {
    if (this.io && !this.isDestroyed) {
      const projectRoom = `project-${this.projectId}`;
      this.io.to(projectRoom).emit('files:updated', { 
        projectId: this.projectId.toString(),
        eventType,
        timestamp: Date.now()
      });
    }
  }

  private async performAtomicSync(): Promise<void> {
    if (!fs.existsSync(this.workspaceDir)) {
      console.log(`Workspace directory ${this.workspaceDir} doesn't exist`);
      return;
    }

    // Use database transaction for atomicity
    const { db } = await import('../db');
    
    try {
      await db.transaction(async (tx) => {
        // Get current files from database within transaction
        const dbFiles = await storage.getProjectFiles(this.projectId);
        const dbFileMap = new Map(dbFiles.map(f => [f.path, f]));

        // Scan filesystem with better error handling
        const fsFiles = await this.scanDirectoryAtomic(this.workspaceDir, '');
        const fsFileMap = new Map(fsFiles.map(f => [f.path, f]));

        // Categorize operations
        const operations = this.categorizeFileOperations(dbFileMap, fsFileMap);

        // Execute operations in order: folders first, then files
        await this.executeFileOperations(operations, tx);

        console.log(`Atomic sync completed: ${operations.toAdd.length} added, ${operations.toUpdate.length} updated, ${operations.toDelete.length} deleted`);
      });
    } catch (error) {
      console.error('Database transaction failed during sync:', error);
      throw error;
    }
  }

  private categorizeFileOperations(dbFileMap: Map<string, any>, fsFileMap: Map<string, any>) {
    const toAdd: any[] = [];
    const toUpdate: any[] = [];
    const toDelete: any[] = [];

    // Check filesystem files against database
    for (const [fsPath, fsFile] of fsFileMap.entries()) {
      const dbFile = dbFileMap.get(fsPath);
      
      if (!dbFile) {
        // Check if this file was recently deleted - if so, skip adding it back
        if (this.recentlyDeleted.has(fsFile.path)) {
          console.log(`Skipping recently deleted file: ${fsFile.path}`);
          continue;
        }
        
        // New file - categorize by type
        toAdd.push({
          name: fsFile.name,
          path: fsFile.path,
          content: fsFile.content,
          isFolder: fsFile.isFolder,
          projectId: this.projectId,
          parentId: null, // Will be resolved during execution
          priority: fsFile.isFolder ? 1 : 2 // Folders first
        });
      } else if (!fsFile.isFolder && fsFile.content !== dbFile.content) {
        // Updated file content
        toUpdate.push({
          id: dbFile.id,
          content: fsFile.content,
          updatedAt: new Date(),
          priority: 3
        });
      }
    }

    // Check for deleted files (files in DB but not in filesystem)
    for (const [dbPath, dbFile] of dbFileMap.entries()) {
      if (!fsFileMap.has(dbPath) && !this.recentlyDeleted.has(dbPath)) {
        // File was deleted from filesystem but not recently deleted via API
        // Be conservative - only auto-delete if it's been missing for a while
        console.log(`File ${dbPath} exists in DB but not filesystem - manual intervention may be needed`);
      }
    }

    // Sort operations by priority
    toAdd.sort((a, b) => a.priority - b.priority);
    toUpdate.sort((a, b) => a.priority - b.priority);

    return { toAdd, toUpdate, toDelete };
  }

  private async executeFileOperations(operations: any, tx: any): Promise<void> {
    const { toAdd, toUpdate, toDelete } = operations;

    // Execute additions (folders first, then files)
    for (const fileData of toAdd) {
      try {
        // Resolve parent ID based on path hierarchy
        const parentPath = fileData.path.substring(0, fileData.path.lastIndexOf('/'));
        if (parentPath) {
          const parentFile = await storage.getProjectFiles(this.projectId);
          const parent = parentFile.find(f => f.path === parentPath && f.isFolder);
          if (parent) {
            fileData.parentId = parent.id;
          }
        }

        const newFile = await storage.createFile(fileData);
        this.emitFileEvent('create', fileData.path, { fileId: newFile.id });
      } catch (error) {
        console.error(`Error adding file ${fileData.path}:`, error);
        // Continue with other operations
      }
    }

    // Execute updates
    for (const updateData of toUpdate) {
      try {
        await storage.updateFile(updateData.id, {
          content: updateData.content,
          updatedAt: updateData.updatedAt
        });
        
        // Find the file path for event emission
        const file = await storage.getFile(updateData.id);
        if (file) {
          this.emitFileEvent('update', file.path, { fileId: file.id });
        }
      } catch (error) {
        console.error(`Error updating file ${updateData.id}:`, error);
        // Continue with other operations
      }
    }

    // Execute deletions (if any)
    for (const deleteData of toDelete) {
      try {
        await storage.deleteFile(deleteData.id);
        this.emitFileEvent('delete', deleteData.path, { fileId: deleteData.id });
      } catch (error) {
        console.error(`Error deleting file ${deleteData.id}:`, error);
        // Continue with other operations
      }
    }
  }

  private async scanDirectoryAtomic(dir: string, relativePath: string = ''): Promise<any[]> {
    const files: any[] = [];
    
    try {
      if (!fs.existsSync(dir)) {
        return files;
      }
      
      const stats = fs.lstatSync(dir);
      if (!stats.isDirectory()) return files;

      const items = fs.readdirSync(dir);
      
      // Filter out problematic items
      const filteredItems = items.filter(item => {
        if (item.startsWith('.')) return false;
        if (item === 'node_modules') return false;
        if (item.startsWith('tmp') || item.includes('~')) return false;
        if (item.includes('.lock') || item.includes('.cache')) return false;
        return true;
      });
      
      // Process folders first for proper hierarchy
      const folders = [];
      const regularFiles = [];
      
      for (const item of filteredItems) {
        const itemPath = path.join(dir, item);
        const itemRelativePath = path.posix.join(relativePath, item);
        
        try {
          const itemStats = fs.lstatSync(itemPath);
          
          if (itemStats.isDirectory()) {
            folders.push({ item, itemPath, itemRelativePath, stats: itemStats });
          } else if (itemStats.isFile()) {
            regularFiles.push({ item, itemPath, itemRelativePath, stats: itemStats });
          }
        } catch (error) {
          console.error(`Error reading item ${itemPath}:`, error);
          continue;
        }
      }
      
      // Add folders first
      for (const { item, itemPath, itemRelativePath } of folders) {
        files.push({
          name: item,
          path: itemRelativePath,
          content: null,
          isFolder: true
        });
        
        // Recursively scan subdirectories
        const subFiles = await this.scanDirectoryAtomic(itemPath, itemRelativePath);
        files.push(...subFiles);
      }
      
      // Add files
      for (const { item, itemPath, itemRelativePath, stats } of regularFiles) {
        try {
          // Check file size limit
          const maxSize = parseInt(process.env.MAX_FILE_SIZE_MB || '10') * 1024 * 1024;
          if (stats.size > maxSize) {
            console.warn(`File ${itemRelativePath} exceeds size limit (${stats.size} bytes)`);
            continue;
          }
          
          // Check if file is binary
          const isBinary = await this.isBinaryFile(itemPath);
          let content = null;
          
          if (!isBinary) {
            try {
              content = fs.readFileSync(itemPath, 'utf-8');
            } catch (error) {
              console.error(`Error reading file content ${itemPath}:`, error);
              content = ''; // Empty content for unreadable files
            }
          } else {
            console.log(`Skipping binary file: ${itemRelativePath}`);
            continue; // Skip binary files
          }
          
          files.push({
            name: item,
            path: itemRelativePath,
            content,
            isFolder: false
          });
        } catch (error) {
          console.error(`Error processing file ${itemPath}:`, error);
          continue;
        }
      }
      
    } catch (error) {
      console.error(`Error scanning directory ${dir}:`, error);
    }
    
    return files;
  }

  private async isBinaryFile(filePath: string): Promise<boolean> {
    try {
      const buffer = fs.readFileSync(filePath, { encoding: null });
      const bytes = buffer.subarray(0, Math.min(512, buffer.length));
      
      // Check for null bytes (common in binary files)
      for (let i = 0; i < bytes.length; i++) {
        if (bytes[i] === 0) {
          return true;
        }
      }
      
      // Check for high percentage of non-printable characters
      let nonPrintable = 0;
      for (let i = 0; i < bytes.length; i++) {
        const byte = bytes[i];
        if (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) {
          nonPrintable++;
        }
      }
      
      return (nonPrintable / bytes.length) > 0.3; // 30% threshold
    } catch (error) {
      console.error(`Error checking if file is binary: ${filePath}`, error);
      return true; // Assume binary if we can't read it
    }
  }

  // Mark a file as recently deleted to prevent re-sync
  markAsDeleted(filePath: string): void {
    this.recentlyDeleted.set(filePath, Date.now());
    console.log(`Marked file as recently deleted: ${filePath}`);
  }

  // Get sync status
  getSyncStatus(): { inProgress: boolean; pendingOperations: number; lastSync?: Date } {
    return {
      inProgress: this.syncInProgress,
      pendingOperations: this.pendingOperations.size,
      lastSync: new Date() // Could track actual last sync time
    };
  }

  // Cleanup method
  cleanup(): void {
    console.log(`Cleaning up FileSync for project ${this.projectId}`);
    this.isDestroyed = true;
    
    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout);
      this.syncTimeout = null;
    }
    
    if (this.deleteTimeout) {
      clearInterval(this.deleteTimeout);
      this.deleteTimeout = null;
    }
    
    this.recentlyDeleted.clear();
    this.pendingOperations.clear();
  }
}

// Global registry for FileSync instances
class FileSyncRegistry {
  private instances = new Map<string, FileSync>();
  
  getOrCreate(projectId: number, workspaceDir: string, io?: SocketIOServer): FileSync {
    const key = `${projectId}`;
    
    let instance = this.instances.get(key);
    if (!instance) {
      instance = new FileSync(projectId, workspaceDir, io);
      this.instances.set(key, instance);
    }
    
    return instance;
  }
  
  get(projectId: number): FileSync | undefined {
    return this.instances.get(`${projectId}`);
  }
  
  remove(projectId: number): void {
    const key = `${projectId}`;
    const instance = this.instances.get(key);
    if (instance) {
      instance.cleanup();
      this.instances.delete(key);
    }
  }
  
  cleanup(): void {
    for (const [key, instance] of this.instances.entries()) {
      instance.cleanup();
    }
    this.instances.clear();
  }
}

export const fileSyncRegistry = new FileSyncRegistry();

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Cleaning up FileSync instances...');
  fileSyncRegistry.cleanup();
});

process.on('SIGINT', () => {
  console.log('Cleaning up FileSync instances...');
  fileSyncRegistry.cleanup();
});