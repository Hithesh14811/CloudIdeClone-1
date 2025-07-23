import { 
  users, 
  projects, 
  files,
  type User, 
  type UpsertUser,
  type Project, 
  type InsertProject,
  type File,
  type InsertFile
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, asc, sql, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";

// Enhanced storage interface with transaction support
interface IStorage {
  // User methods
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  
  // Project methods
  getUserProjects(userId: string, options?: { limit?: number; offset?: number }): Promise<Project[]>;
  getProject(projectId: number): Promise<Project | undefined>;
  createProject(project: InsertProject): Promise<Project>;
  updateProject(projectId: number, updates: Partial<InsertProject>): Promise<Project>;
  deleteProject(projectId: number): Promise<void>;
  
  // File methods
  getProjectFiles(projectId: number): Promise<File[]>;
  getFile(fileId: number): Promise<File | undefined>;
  getFileByPath(projectId: number, filePath: string): Promise<File | undefined>;
  createFile(file: InsertFile): Promise<File>;
  createOrUpdateFile(file: InsertFile): Promise<File>;
  updateFile(fileId: number, updates: Partial<InsertFile>): Promise<File>;
  deleteFile(fileId: number): Promise<void>;
  deleteProjectFiles(projectId: number): Promise<void>;
  
  // Batch operations for performance
  createFilesBatch(files: InsertFile[]): Promise<File[]>;
  updateFilesBatch(updates: Array<{ id: number; updates: Partial<InsertFile> }>): Promise<File[]>;
  deleteFilesBatch(fileIds: number[]): Promise<void>;
  
  // Analytics and monitoring
  getUserStats(userId: string): Promise<{ projectCount: number; fileCount: number; totalSize: number }>;
  getSystemStats(): Promise<{ userCount: number; projectCount: number; fileCount: number }>;
}

// Enhanced database storage implementation with transactions and optimizations
export class DatabaseStorage implements IStorage {
  
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    try {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, id))
        .limit(1);
      return user || undefined;
    } catch (error) {
      console.error('Error getting user:', error);
      throw new Error('Failed to retrieve user');
    }
  }

  async upsertUser(user: UpsertUser): Promise<User> {
    try {
      return await db.transaction(async (tx) => {
        const [existingUser] = await tx
          .select()
          .from(users)
          .where(eq(users.id, user.id))
          .limit(1);
        
        if (existingUser) {
          const [updatedUser] = await tx
            .update(users)
            .set({
              email: user.email,
              firstName: user.firstName,
              lastName: user.lastName,
              profileImageUrl: user.profileImageUrl,
              updatedAt: new Date(),
            })
            .where(eq(users.id, user.id))
            .returning();
          return updatedUser;
        } else {
          const [newUser] = await tx
            .insert(users)
            .values({
              ...user,
              createdAt: new Date(),
              updatedAt: new Date(),
            })
            .returning();
          return newUser;
        }
      });
    } catch (error) {
      console.error('Error upserting user:', error);
      throw new Error('Failed to create or update user');
    }
  }

  // Project operations
  async getUserProjects(userId: string, options: { limit?: number; offset?: number } = {}): Promise<Project[]> {
    try {
      const { limit = 50, offset = 0 } = options;
      
      return await db
        .select()
        .from(projects)
        .where(eq(projects.userId, userId))
        .orderBy(desc(projects.updatedAt))
        .limit(Math.min(limit, 100)) // Cap at 100
        .offset(Math.max(offset, 0));
    } catch (error) {
      console.error('Error getting user projects:', error);
      throw new Error('Failed to retrieve user projects');
    }
  }

  async getProject(projectId: number): Promise<Project | undefined> {
    try {
      const [project] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);
      return project || undefined;
    } catch (error) {
      console.error('Error getting project:', error);
      throw new Error('Failed to retrieve project');
    }
  }

  async createProject(project: InsertProject): Promise<Project> {
    try {
      return await db.transaction(async (tx) => {
        // Check user's project quota
        const userProjects = await tx
          .select({ count: sql<number>`count(*)` })
          .from(projects)
          .where(eq(projects.userId, project.userId));
        
        const maxProjects = parseInt(process.env.MAX_PROJECTS_PER_USER || '50');
        if (userProjects[0]?.count >= maxProjects) {
          throw new Error(`Maximum project limit reached (${maxProjects})`);
        }
        
        const [newProject] = await tx
          .insert(projects)
          .values({
            ...project,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .returning();
        
        return newProject;
      });
    } catch (error) {
      console.error('Error creating project:', error);
      if (error instanceof Error && error.message.includes('Maximum project limit')) {
        throw error;
      }
      throw new Error('Failed to create project');
    }
  }

  async updateProject(projectId: number, updates: Partial<InsertProject>): Promise<Project> {
    try {
      const [updatedProject] = await db
        .update(projects)
        .set({
          ...updates,
          updatedAt: new Date(),
        })
        .where(eq(projects.id, projectId))
        .returning();
      
      if (!updatedProject) {
        throw new Error('Project not found');
      }
      
      return updatedProject;
    } catch (error) {
      console.error('Error updating project:', error);
      throw new Error('Failed to update project');
    }
  }

  async deleteProject(projectId: number): Promise<void> {
    try {
      await db.transaction(async (tx) => {
        // Delete all project files first
        await tx.delete(files).where(eq(files.projectId, projectId));
        
        // Delete the project
        const result = await tx.delete(projects).where(eq(projects.id, projectId));
        
        if (result.rowCount === 0) {
          throw new Error('Project not found');
        }
      });
    } catch (error) {
      console.error('Error deleting project:', error);
      throw new Error('Failed to delete project');
    }
  }

  // File operations
  async getProjectFiles(projectId: number): Promise<File[]> {
    try {
      return await db
        .select()
        .from(files)
        .where(eq(files.projectId, projectId))
        .orderBy(asc(files.isFolder), asc(files.name)); // Folders first, then alphabetical
    } catch (error) {
      console.error('Error getting project files:', error);
      throw new Error('Failed to retrieve project files');
    }
  }

  async getFile(fileId: number): Promise<File | undefined> {
    try {
      const [file] = await db
        .select()
        .from(files)
        .where(eq(files.id, fileId))
        .limit(1);
      return file || undefined;
    } catch (error) {
      console.error('Error getting file:', error);
      throw new Error('Failed to retrieve file');
    }
  }

  async getFileByPath(projectId: number, filePath: string): Promise<File | undefined> {
    try {
      const [file] = await db
        .select()
        .from(files)
        .where(and(eq(files.projectId, projectId), eq(files.path, filePath)))
        .limit(1);
      return file || undefined;
    } catch (error) {
      console.error('Error getting file by path:', error);
      throw new Error('Failed to retrieve file by path');
    }
  }

  async createFile(file: InsertFile): Promise<File> {
    try {
      return await db.transaction(async (tx) => {
        // Check project's file quota
        const projectFiles = await tx
          .select({ count: sql<number>`count(*)` })
          .from(files)
          .where(eq(files.projectId, file.projectId));
        
        const maxFiles = parseInt(process.env.MAX_FILES_PER_PROJECT || '1000');
        if (projectFiles[0]?.count >= maxFiles) {
          throw new Error(`Maximum file limit reached for project (${maxFiles})`);
        }
        
        // Check for duplicate paths
        const [existingFile] = await tx
          .select()
          .from(files)
          .where(and(eq(files.projectId, file.projectId), eq(files.path, file.path)))
          .limit(1);
        
        if (existingFile) {
          throw new Error(`File already exists at path: ${file.path}`);
        }
        
        const [newFile] = await tx
          .insert(files)
          .values({
            ...file,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .returning();
        
        return newFile;
      });
    } catch (error) {
      console.error('Error creating file:', error);
      if (error instanceof Error && (
        error.message.includes('Maximum file limit') ||
        error.message.includes('File already exists')
      )) {
        throw error;
      }
      throw new Error('Failed to create file');
    }
  }

  async createOrUpdateFile(file: InsertFile): Promise<File> {
    try {
      return await db.transaction(async (tx) => {
        const [existingFile] = await tx
          .select()
          .from(files)
          .where(and(eq(files.projectId, file.projectId), eq(files.path, file.path)))
          .limit(1);
        
        if (existingFile) {
          // Update existing file
          const [updatedFile] = await tx
            .update(files)
            .set({
              content: file.content,
              name: file.name,
              isFolder: file.isFolder,
              parentId: file.parentId,
              updatedAt: new Date(),
            })
            .where(eq(files.id, existingFile.id))
            .returning();
          
          return updatedFile;
        } else {
          // Create new file
          const [newFile] = await tx
            .insert(files)
            .values({
              ...file,
              createdAt: new Date(),
              updatedAt: new Date(),
            })
            .returning();
          
          return newFile;
        }
      });
    } catch (error) {
      console.error('Error creating or updating file:', error);
      throw new Error('Failed to create or update file');
    }
  }

  async updateFile(fileId: number, updates: Partial<InsertFile>): Promise<File> {
    try {
      const [updatedFile] = await db
        .update(files)
        .set({
          ...updates,
          updatedAt: new Date(),
        })
        .where(eq(files.id, fileId))
        .returning();
      
      if (!updatedFile) {
        throw new Error('File not found');
      }
      
      return updatedFile;
    } catch (error) {
      console.error('Error updating file:', error);
      throw new Error('Failed to update file');
    }
  }

  async deleteFile(fileId: number): Promise<void> {
    try {
      const result = await db.delete(files).where(eq(files.id, fileId));
      
      if (result.rowCount === 0) {
        throw new Error('File not found');
      }
    } catch (error) {
      console.error('Error deleting file:', error);
      throw new Error('Failed to delete file');
    }
  }

  async deleteProjectFiles(projectId: number): Promise<void> {
    try {
      await db.delete(files).where(eq(files.projectId, projectId));
    } catch (error) {
      console.error('Error deleting project files:', error);
      throw new Error('Failed to delete project files');
    }
  }

  // Batch operations for performance
  async createFilesBatch(filesToCreate: InsertFile[]): Promise<File[]> {
    if (filesToCreate.length === 0) return [];
    
    try {
      return await db.transaction(async (tx) => {
        const createdFiles: File[] = [];
        
        // Process in smaller batches to avoid query size limits
        const batchSize = 50;
        for (let i = 0; i < filesToCreate.length; i += batchSize) {
          const batch = filesToCreate.slice(i, i + batchSize);
          
          const batchWithTimestamps = batch.map(file => ({
            ...file,
            createdAt: new Date(),
            updatedAt: new Date(),
          }));
          
          const batchResults = await tx
            .insert(files)
            .values(batchWithTimestamps)
            .returning();
          
          createdFiles.push(...batchResults);
        }
        
        return createdFiles;
      });
    } catch (error) {
      console.error('Error creating files batch:', error);
      throw new Error('Failed to create files in batch');
    }
  }

  async updateFilesBatch(updates: Array<{ id: number; updates: Partial<InsertFile> }>): Promise<File[]> {
    if (updates.length === 0) return [];
    
    try {
      return await db.transaction(async (tx) => {
        const updatedFiles: File[] = [];
        
        // Process updates individually within transaction for better error handling
        for (const { id, updates: fileUpdates } of updates) {
          try {
            const [updatedFile] = await tx
              .update(files)
              .set({
                ...fileUpdates,
                updatedAt: new Date(),
              })
              .where(eq(files.id, id))
              .returning();
            
            if (updatedFile) {
              updatedFiles.push(updatedFile);
            }
          } catch (error) {
            console.error(`Error updating file ${id}:`, error);
            // Continue with other updates
          }
        }
        
        return updatedFiles;
      });
    } catch (error) {
      console.error('Error updating files batch:', error);
      throw new Error('Failed to update files in batch');
    }
  }

  async deleteFilesBatch(fileIds: number[]): Promise<void> {
    if (fileIds.length === 0) return;
    
    try {
      await db.delete(files).where(inArray(files.id, fileIds));
    } catch (error) {
      console.error('Error deleting files batch:', error);
      throw new Error('Failed to delete files in batch');
    }
  }

  // Analytics and monitoring
  async getUserStats(userId: string): Promise<{ projectCount: number; fileCount: number; totalSize: number }> {
    try {
      const [stats] = await db
        .select({
          projectCount: sql<number>`count(distinct ${projects.id})`,
          fileCount: sql<number>`count(${files.id})`,
          totalSize: sql<number>`coalesce(sum(length(${files.content})), 0)`,
        })
        .from(projects)
        .leftJoin(files, eq(projects.id, files.projectId))
        .where(eq(projects.userId, userId));
      
      return {
        projectCount: stats?.projectCount || 0,
        fileCount: stats?.fileCount || 0,
        totalSize: stats?.totalSize || 0,
      };
    } catch (error) {
      console.error('Error getting user stats:', error);
      throw new Error('Failed to retrieve user statistics');
    }
  }

  async getSystemStats(): Promise<{ userCount: number; projectCount: number; fileCount: number }> {
    try {
      const [userStats] = await db
        .select({ count: sql<number>`count(*)` })
        .from(users);
      
      const [projectStats] = await db
        .select({ count: sql<number>`count(*)` })
        .from(projects);
      
      const [fileStats] = await db
        .select({ count: sql<number>`count(*)` })
        .from(files);
      
      return {
        userCount: userStats?.count || 0,
        projectCount: projectStats?.count || 0,
        fileCount: fileStats?.count || 0,
      };
    } catch (error) {
      console.error('Error getting system stats:', error);
      throw new Error('Failed to retrieve system statistics');
    }
  }

  // Health check for database
  async healthCheck(): Promise<{ status: string; latency: number; connectionCount?: number }> {
    const start = Date.now();
    
    try {
      await db.execute(sql`SELECT 1`);
      const latency = Date.now() - start;
      
      return {
        status: 'healthy',
        latency,
      };
    } catch (error) {
      console.error('Database health check failed:', error);
      return {
        status: 'unhealthy',
        latency: Date.now() - start,
      };
    }
  }

  // Cleanup old data
  async cleanupOldData(daysOld: number = 90): Promise<{ deletedProjects: number; deletedFiles: number }> {
    try {
      return await db.transaction(async (tx) => {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysOld);
        
        // Find old projects (you might want to add additional criteria)
        const oldProjects = await tx
          .select({ id: projects.id })
          .from(projects)
          .where(sql`${projects.updatedAt} < ${cutoffDate}`);
        
        const projectIds = oldProjects.map(p => p.id);
        
        if (projectIds.length === 0) {
          return { deletedProjects: 0, deletedFiles: 0 };
        }
        
        // Delete files first
        const deletedFiles = await tx
          .delete(files)
          .where(inArray(files.projectId, projectIds));
        
        // Delete projects
        const deletedProjects = await tx
          .delete(projects)
          .where(inArray(projects.id, projectIds));
        
        return {
          deletedProjects: deletedProjects.rowCount || 0,
          deletedFiles: deletedFiles.rowCount || 0,
        };
      });
    } catch (error) {
      console.error('Error cleaning up old data:', error);
      throw new Error('Failed to cleanup old data');
    }
  }
}

// Create singleton instance
export const storage = new DatabaseStorage();

// Export for testing and advanced usage
export { DatabaseStorage };