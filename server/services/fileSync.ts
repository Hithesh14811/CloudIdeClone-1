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

    // Check for deleted files (but be careful not to delete files that were intentionally removed from DB)
    // We'll skip auto-deletion of files that don't exist in filesystem to avoid conflicts
    // Users can manually delete files they don't want through the UI

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