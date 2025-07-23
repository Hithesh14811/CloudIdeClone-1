import { storage } from '../storage';
import * as fs from 'fs';
import * as path from 'path';
import { Server as SocketIOServer } from 'socket.io';

export class FileSync {
  private projectId: number;
  private workspaceDir: string;
  private syncTimeout: NodeJS.Timeout | null = null;
  private recentlyDeleted = new Set<string>(); // Track recently deleted file paths
  private deleteTimeout: NodeJS.Timeout | null = null;
  private io: SocketIOServer | null = null;

  constructor(projectId: number, workspaceDir: string, io?: SocketIOServer) {
    this.projectId = projectId;
    this.workspaceDir = workspaceDir;
    this.io = io || null;
  }

  // Sync filesystem changes to database with socket-first updates for instant UI
  async syncWorkspaceToDatabase(): Promise<void> {
    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout);
    }

    // Emit immediate event for instant UI updates
    this.emitFileUpdateEvent();

    this.syncTimeout = setTimeout(async () => {
      try {
        await this.performSync();
        console.log(`File sync completed for project ${this.projectId}`);
        // Emit final event after database sync completes
        this.emitFileUpdateEvent();
      } catch (error) {
        console.error('File sync error:', error);
      }
    }, 200); // Reduced to 200ms for ultra-fast updates
  }

  // Immediate file event emission for progressive updates
  emitFileEvent(eventType: string, filePath: string): void {
    if (this.io) {
      const projectRoom = `project-${this.projectId}`;
      this.io.to(projectRoom).emit('files:updated', { 
        projectId: this.projectId.toString(),
        eventType,
        filePath,
        timestamp: Date.now()
      });
      console.log(`Emitted ${eventType} event for ${filePath} to room ${projectRoom}`);
    }
  }

  // Emit socket event for real-time frontend updates
  private emitFileUpdateEvent(): void {
    if (this.io) {
      const projectRoom = `project-${this.projectId}`;
      this.io.to(projectRoom).emit('files:updated', { 
        projectId: this.projectId.toString(),
        timestamp: Date.now()
      });
      console.log(`Emitted files:updated event to room ${projectRoom}`);
    }
  }



  private async performSync(): Promise<void> {
    if (!fs.existsSync(this.workspaceDir)) {
      console.log(`Workspace directory ${this.workspaceDir} doesn't exist`);
      return;
    }

    // Get current files from database
    const dbFiles = await storage.getProjectFiles(this.projectId);
    const dbFileMap = new Map(dbFiles.map(f => [f.path, f]));

    // Scan filesystem and build file structure
    const fsFiles = await this.scanDirectory(this.workspaceDir, '');
    const fsFileMap = new Map(fsFiles.map(f => [f.path, f]));

    // Find files to add, update, or delete
    const toAdd: any[] = [];
    const toUpdate: any[] = [];
    const toDelete: any[] = [];

    // Check filesystem files against database
    for (const fsPath of Array.from(fsFileMap.keys())) {
      const fsFile = fsFileMap.get(fsPath)!;
      const dbFile = dbFileMap.get(fsPath);

      if (!dbFile) {
        // Check if this file was recently deleted - if so, skip adding it back
        if (this.recentlyDeleted.has(fsFile.path)) {
          console.log(`Skipping recently deleted file: ${fsFile.path}`);
          continue;
        }

        // New file
        toAdd.push({
          name: fsFile.name,
          path: fsFile.path,
          content: fsFile.content,
          isFolder: fsFile.isFolder,
          projectId: this.projectId,
          parentId: null // Will be set during creation based on hierarchy
        });
      } else if (fsFile.content !== dbFile.content && !fsFile.isFolder) {
        // Updated file content
        toUpdate.push({
          id: dbFile.id,
          content: fsFile.content,
          updatedAt: new Date()
        });
      }
    }

    // Check for deleted files (but be careful not to delete files that were intentionally removed from DB)
    // We'll skip auto-deletion of files that don't exist in filesystem to avoid conflicts
    // Users can manually delete files they don't want through the UI

    // Perform database operations
    console.log(`Sync stats: ${toAdd.length} to add, ${toUpdate.length} to update, ${toDelete.length} to delete`);

    // Delete removed files
    for (const fileId of toDelete) {
      await storage.deleteFile(fileId);
    }

    // Add new files - handle folders first, then files to maintain hierarchy
    const foldersToAdd = toAdd.filter(f => f.isFolder);
    const filesToAdd = toAdd.filter(f => !f.isFolder);

    // Create folders first and build parent-child relationships
    const pathToIdMap = new Map<string, number>();

    // Also include existing database folders in the path map for proper hierarchy
    const existingFolders = dbFiles.filter(f => f.isFolder);
    for (const folder of existingFolders) {
      pathToIdMap.set(folder.path, folder.id);
    }

    // Sort folders by depth (shallow to deep) to ensure parents are created first
    foldersToAdd.sort((a, b) => {
      const depthA = a.path.split('/').filter((p: string) => p).length;
      const depthB = b.path.split('/').filter((p: string) => p).length;
      return depthA - depthB;
    });

    for (const folderData of foldersToAdd) {
      // Find parent folder ID if it exists
      const parentPath = folderData.path.substring(0, folderData.path.lastIndexOf('/')) || null;
      const parentId = parentPath ? pathToIdMap.get(parentPath) : null;

      const folder = await storage.createOrUpdateFile({
        ...folderData,
        parentId
      });

      pathToIdMap.set(folderData.path, folder.id);
    }

    // Create files and assign proper parent IDs
    for (const fileData of filesToAdd) {
      // Find parent folder ID
      const parentPath = fileData.path.substring(0, fileData.path.lastIndexOf('/')) || null;
      const parentId = parentPath ? pathToIdMap.get(parentPath) : null;

      await storage.createOrUpdateFile({
        ...fileData,
        parentId
      });
    }

    // Update modified files
    for (const updateData of toUpdate) {
      const { id, ...updates } = updateData;
      await storage.updateFile(id, updates);
    }
  }

  private async scanDirectory(dir: string, relativePath: string): Promise<any[]> {
    const results: any[] = [];

    try {
      const items = fs.readdirSync(dir);

      for (const item of items) {
        // Skip problematic directories and files
        if (this.shouldSkipItem(item)) {
          console.log(`Skipping item: ${item}`);
          continue;
        }
        
        // Debug logging for node_modules
        if (item === 'node_modules') {
          console.log(`Processing node_modules in scanDirectory at ${dir}`);
        }

        const fullPath = path.join(dir, item);
        const itemRelativePath = path.join(relativePath, item).replace(/\\/g, '/');

        try {
          const stats = fs.lstatSync(fullPath);

          if (stats.isSymbolicLink()) {
            continue; // Skip symlinks
          }

          if (stats.isDirectory()) {
            // Add folder
            results.push({
              name: item,
              path: itemRelativePath.startsWith('/') ? itemRelativePath : `/${itemRelativePath}`,
              content: null,
              isFolder: true
            });

            // Special handling for node_modules - show top-level packages but don't go deep
            if (item === 'node_modules') {
              console.log(`Found node_modules at ${itemRelativePath}, scanning first level only`);
              // Only scan immediate children of node_modules (first level packages)
              try {
                const nodeModulesItems = fs.readdirSync(fullPath);
                for (const pkg of nodeModulesItems.slice(0, 50)) { // Limit to first 50 packages
                  if (pkg.startsWith('.')) continue; // Skip hidden files
                  
                  const pkgPath = path.join(fullPath, pkg);
                  const pkgRelativePath = path.join(itemRelativePath, pkg).replace(/\\/g, '/');
                  
                  try {
                    const pkgStats = fs.lstatSync(pkgPath);
                    if (pkgStats.isDirectory()) {
                      results.push({
                        name: pkg,
                        path: pkgRelativePath.startsWith('/') ? pkgRelativePath : `/${pkgRelativePath}`,
                        content: null,
                        isFolder: true
                      });
                    }
                  } catch (pkgError) {
                    // Skip problematic packages
                    continue;
                  }
                }
              } catch (error) {
                console.error(`Error scanning node_modules: ${error}`);
              }
            } else {
              // Recursively scan subdirectory (with depth limit)
              const depth = relativePath.split('/').length;
              if (depth < 8) { // Reduced depth limit for performance
                const childResults = await this.scanDirectory(fullPath, itemRelativePath);
                results.push(...childResults);
              }
            }
          } else if (stats.isFile()) {
            // Add file with content (limit file size and handle binary files)
            if (stats.size < 1024 * 1024) { // Skip files larger than 1MB
              let content = '';
              try {
                // Check if file is likely binary
                if (this.isBinaryFile(item)) {
                  content = '[Binary file]';
                } else {
                  const buffer = fs.readFileSync(fullPath);
                  // Check for null bytes (binary indicator)
                  if (buffer.includes(0)) {
                    content = '[Binary file]';
                  } else {
                    content = buffer.toString('utf8').substring(0, 50000); // Limit content size
                  }
                }
              } catch (error) {
                console.error(`Error reading file ${fullPath}:`, error);
                content = '[Error reading file]';
              }

              results.push({
                name: item,
                path: itemRelativePath.startsWith('/') ? itemRelativePath : `/${itemRelativePath}`,
                content,
                isFolder: false
              });
            }
          }
        } catch (itemError) {
          console.error(`Error processing ${fullPath}:`, itemError);
          continue;
        }
      }
    } catch (error) {
      console.error(`Error scanning directory ${dir}:`, error);
    }

    return results;
  }

  private shouldSkipItem(item: string): boolean {
    const skipPatterns = [
      '.git',
      '.cache',
      'dist',
      'build',
      'out',
      'coverage',
      '.next',
      '.nuxt',
      'vendor',
      'tmp',
      'temp'
    ];

    const skipExtensions = [
      '.log',
      '.tmp',
      '.cache'
    ];

    // Skip hidden files except important ones
    if (item.startsWith('.') && item !== '.gitignore' && item !== '.env') {
      return true;
    }

    // Skip patterns
    if (skipPatterns.some(pattern => item === pattern)) {
      return true;
    }

    // Skip extensions
    if (skipExtensions.some(ext => item.endsWith(ext))) {
      return true;
    }

    return false;
  }

  private isBinaryFile(filename: string): boolean {
    const binaryExtensions = [
      '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.ico',
      '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
      '.zip', '.tar', '.gz', '.rar', '.7z',
      '.exe', '.dll', '.so', '.dylib',
      '.mp3', '.mp4', '.avi', '.mov', '.wav',
      '.woff', '.woff2', '.ttf', '.eot'
    ];

    return binaryExtensions.some(ext => filename.toLowerCase().endsWith(ext));
  }

  // Force immediate sync
  async forceSyncNow(): Promise<void> {
    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout);
      this.syncTimeout = null;
    }
    console.log(`Force sync now called for project ${this.projectId} at ${this.workspaceDir}`);
    await this.performSync();
    console.log(`Force sync completed for project ${this.projectId}`);
  }

  // Add cleanup method that may be referenced
  cleanup(): void {
    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout);
      this.syncTimeout = null;
    }
    if (this.deleteTimeout) {
      clearTimeout(this.deleteTimeout);
      this.deleteTimeout = null;
    }
    this.recentlyDeleted.clear();
    console.log(`FileSync cleanup completed for project ${this.projectId}`);
  }

  // Fix hierarchy for existing database files
  async fixDatabaseHierarchy(): Promise<void> {
    const dbFiles = await storage.getProjectFiles(this.projectId);

    // Build path to ID mapping for folders
    const pathToIdMap = new Map<string, number>();
    const foldersToUpdate: Array<{ id: number, parentId: number | null }> = [];
    const filesToUpdate: Array<{ id: number, parentId: number | null }> = [];

    // First pass: map all folders
    for (const file of dbFiles.filter(f => f.isFolder)) {
      pathToIdMap.set(file.path, file.id);
    }

    // Second pass: determine correct parent relationships
    for (const file of dbFiles) {
      const parentPath = file.path.substring(0, file.path.lastIndexOf('/')) || null;
      const correctParentId = parentPath ? pathToIdMap.get(parentPath) || null : null;

      if (file.parentId !== correctParentId) {
        if (file.isFolder) {
          foldersToUpdate.push({ id: file.id, parentId: correctParentId });
        } else {
          filesToUpdate.push({ id: file.id, parentId: correctParentId });
        }
      }
    }

    // Update database with correct parent relationships
    for (const update of [...foldersToUpdate, ...filesToUpdate]) {
      await storage.updateFile(update.id, { parentId: update.parentId });
    }

    if (foldersToUpdate.length > 0 || filesToUpdate.length > 0) {
      console.log(`Fixed hierarchy for ${foldersToUpdate.length} folders and ${filesToUpdate.length} files`);
    }
  }

  // Mark a file as recently deleted to prevent re-sync
  markAsDeleted(filePath: string): void {
    this.recentlyDeleted.add(filePath);

    // Clear the deleted flag after 30 seconds
    if (this.deleteTimeout) {
      clearTimeout(this.deleteTimeout);
    }

    this.deleteTimeout = setTimeout(() => {
      this.recentlyDeleted.delete(filePath);
    }, 30000); // 30 seconds
  }


}