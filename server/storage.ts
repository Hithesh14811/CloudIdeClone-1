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
import { eq, and } from "drizzle-orm";

// Storage interface
interface IStorage {
  // User methods
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  
  // Project methods
  getUserProjects(userId: string): Promise<Project[]>;
  getProject(projectId: number): Promise<Project | undefined>;
  createProject(project: InsertProject): Promise<Project>;
  deleteProject(projectId: number): Promise<void>;
  
  // File methods
  getProjectFiles(projectId: number): Promise<File[]>;
  getFile(fileId: number): Promise<File | undefined>;
  createFile(file: InsertFile): Promise<File>;
  updateFile(fileId: number, updates: Partial<InsertFile>): Promise<File>;
  deleteFile(fileId: number): Promise<void>;
}

// Database storage implementation
export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async upsertUser(user: UpsertUser): Promise<User> {
    const [existingUser] = await db.select().from(users).where(eq(users.id, user.id));
    
    if (existingUser) {
      const [updatedUser] = await db
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
      const [newUser] = await db
        .insert(users)
        .values(user)
        .returning();
      return newUser;
    }
  }

  async getUserProjects(userId: string): Promise<Project[]> {
    return await db.select().from(projects).where(eq(projects.userId, userId));
  }

  async getProject(projectId: number): Promise<Project | undefined> {
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
    return project || undefined;
  }

  async createProject(project: InsertProject): Promise<Project> {
    const [newProject] = await db
      .insert(projects)
      .values(project)
      .returning();
    return newProject;
  }

  async getProjectFiles(projectId: number): Promise<File[]> {
    return await db.select().from(files).where(eq(files.projectId, projectId));
  }

  async getFile(fileId: number): Promise<File | undefined> {
    const [file] = await db.select().from(files).where(eq(files.id, fileId));
    return file || undefined;
  }

  async createFile(file: InsertFile): Promise<File> {
    const [newFile] = await db
      .insert(files)
      .values(file)
      .returning();
    return newFile;
  }

  async updateFile(fileId: number, updates: Partial<InsertFile>): Promise<File> {
    const [updatedFile] = await db
      .update(files)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(files.id, fileId))
      .returning();
    return updatedFile;
  }

  async deleteFile(fileId: number): Promise<void> {
    await db.delete(files).where(eq(files.id, fileId));
  }

  async deleteProject(projectId: number): Promise<void> {
    // Delete all files in the project first (cascading delete should handle this, but being explicit)
    await db.delete(files).where(eq(files.projectId, projectId));
    // Delete the project
    await db.delete(projects).where(eq(projects.id, projectId));
  }
}

export const storage = new DatabaseStorage();