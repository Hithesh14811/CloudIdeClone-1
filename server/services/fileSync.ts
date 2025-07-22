import { storage } from '../storage';
import * as fs from 'fs';
import * as path from 'path';

export class FileSync {
  private projectId: number;
  private workspaceDir: string;
  private syncTimeout: NodeJS.Timeout | null = null;

  constructor(projectId: number, workspaceDir: string) {
    this.projectId = projectId;
    this.workspaceDir = workspaceDir;
  }

  // Sync filesystem changes to database with debouncing
  async syncWorkspaceToDatabase(): Promise<void> {
    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout);
    }
    
    this.syncTimeout = setTimeout(async () => {
      try {
        await this.performSync();
        console.log(`File sync completed for project ${this.projectId}`);
      } catch (error) {
        console.error('File sync error:', error);
      }
    }, 1000); // Debounce for 1 second
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
        // New file
        toAdd.push({
          name: fsFile.name,
          path: fsFile.path,
          content: fsFile.content,
          isFolder: fsFile.isFolder,
          projectId: this.projectId,
          parentId: null // We'll handle hierarchy later
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

    // Check for deleted files
    for (const dbPath of Array.from(dbFileMap.keys())) {
      const dbFile = dbFileMap.get(dbPath)!;
      if (!fsFileMap.has(dbPath)) {
        toDelete.push(dbFile.id);
      }
    }

    // Perform database operations
    console.log(`Sync stats: ${toAdd.length} to add, ${toUpdate.length} to update, ${toDelete.length} to delete`);

    // Delete removed files
    for (const fileId of toDelete) {
      await storage.deleteFile(fileId);
    }

    // Add new files
    for (const fileData of toAdd) {
      await storage.createFile(fileData);
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
          continue;
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
            
            // Recursively scan subdirectory (with depth limit)
            const depth = relativePath.split('/').length;
            if (depth < 10) { // Limit recursion depth
              const childResults = await this.scanDirectory(fullPath, itemRelativePath);
              results.push(...childResults);
            }
          } else if (stats.isFile()) {
            // Add file with content (limit file size)
            if (stats.size < 1024 * 1024) { // Skip files larger than 1MB
              const content = fs.readFileSync(fullPath, 'utf8').substring(0, 100000); // Limit content size
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
      'node_modules',
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
      '.cache',
      '.lock'
    ];

    // Skip hidden files
    if (item.startsWith('.') && item !== '.gitignore' && item !== '.env') {
      return true;
    }

    // Skip patterns
    if (skipPatterns.some(pattern => item === pattern || item.includes(pattern))) {
      return true;
    }

    // Skip extensions
    if (skipExtensions.some(ext => item.endsWith(ext))) {
      return true;
    }

    return false;
  }

  // Force immediate sync
  async forceSyncNow(): Promise<void> {
    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout);
      this.syncTimeout = null;
    }
    await this.performSync();
  }

  // Cleanup
  cleanup(): void {
    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout);
      this.syncTimeout = null;
    }
  }
}