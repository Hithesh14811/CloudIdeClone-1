import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { DatabaseStorage } from '../storage';
import { db } from '../db';

// Mock the database
jest.mock('../db', () => ({
  db: {
    transaction: jest.fn(),
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    execute: jest.fn()
  }
}));

describe('DatabaseStorage', () => {
  let storage: DatabaseStorage;
  let mockDb: jest.Mocked<typeof db>;

  beforeEach(() => {
    storage = new DatabaseStorage();
    mockDb = db as jest.Mocked<typeof db>;
    
    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('User operations', () => {
    it('should get user by id', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        profileImageUrl: null,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([mockUser])
          })
        })
      } as any);

      const result = await storage.getUser('user-1');
      expect(result).toEqual(mockUser);
    });

    it('should return undefined for non-existent user', async () => {
      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([])
          })
        })
      } as any);

      const result = await storage.getUser('non-existent');
      expect(result).toBeUndefined();
    });

    it('should upsert user - create new', async () => {
      const newUser = {
        id: 'user-1',
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        profileImageUrl: null
      };

      const createdUser = {
        ...newUser,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockDb.transaction.mockImplementation(async (callback) => {
        return await callback({
          select: jest.fn().mockReturnValue({
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue([]) // No existing user
              })
            })
          }),
          insert: jest.fn().mockReturnValue({
            values: jest.fn().mockReturnValue({
              returning: jest.fn().mockResolvedValue([createdUser])
            })
          })
        });
      });

      const result = await storage.upsertUser(newUser);
      expect(result).toEqual(createdUser);
    });

    it('should upsert user - update existing', async () => {
      const existingUser = {
        id: 'user-1',
        email: 'old@example.com',
        firstName: 'Old',
        lastName: 'User',
        profileImageUrl: null,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const updateData = {
        id: 'user-1',
        email: 'new@example.com',
        firstName: 'New',
        lastName: 'User',
        profileImageUrl: 'http://example.com/avatar.jpg'
      };

      const updatedUser = {
        ...updateData,
        createdAt: existingUser.createdAt,
        updatedAt: new Date()
      };

      mockDb.transaction.mockImplementation(async (callback) => {
        return await callback({
          select: jest.fn().mockReturnValue({
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue([existingUser])
              })
            })
          }),
          update: jest.fn().mockReturnValue({
            set: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue({
                returning: jest.fn().mockResolvedValue([updatedUser])
              })
            })
          })
        });
      });

      const result = await storage.upsertUser(updateData);
      expect(result).toEqual(updatedUser);
    });
  });

  describe('Project operations', () => {
    it('should get user projects with pagination', async () => {
      const mockProjects = [
        {
          id: 1,
          name: 'Project 1',
          description: 'Test project 1',
          userId: 'user-1',
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: 2,
          name: 'Project 2',
          description: 'Test project 2',
          userId: 'user-1',
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            orderBy: jest.fn().mockReturnValue({
              limit: jest.fn().mockReturnValue({
                offset: jest.fn().mockResolvedValue(mockProjects)
              })
            })
          })
        })
      } as any);

      const result = await storage.getUserProjects('user-1', { limit: 10, offset: 0 });
      expect(result).toEqual(mockProjects);
    });

    it('should create project with quota check', async () => {
      const projectData = {
        name: 'New Project',
        description: 'A new test project',
        userId: 'user-1'
      };

      const createdProject = {
        id: 1,
        ...projectData,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockDb.transaction.mockImplementation(async (callback) => {
        return await callback({
          select: jest.fn().mockReturnValue({
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockResolvedValue([{ count: 5 }]) // Under limit
            })
          }),
          insert: jest.fn().mockReturnValue({
            values: jest.fn().mockReturnValue({
              returning: jest.fn().mockResolvedValue([createdProject])
            })
          })
        });
      });

      const result = await storage.createProject(projectData);
      expect(result).toEqual(createdProject);
    });

    it('should reject project creation when quota exceeded', async () => {
      const projectData = {
        name: 'New Project',
        description: 'A new test project',
        userId: 'user-1'
      };

      mockDb.transaction.mockImplementation(async (callback) => {
        return await callback({
          select: jest.fn().mockReturnValue({
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockResolvedValue([{ count: 50 }]) // At limit
            })
          })
        });
      });

      await expect(storage.createProject(projectData)).rejects.toThrow('Maximum project limit reached');
    });

    it('should delete project with cascading file deletion', async () => {
      mockDb.transaction.mockImplementation(async (callback) => {
        return await callback({
          delete: jest.fn().mockImplementation((table) => ({
            where: jest.fn().mockResolvedValue({ rowCount: table === 'projects' ? 1 : 5 })
          }))
        });
      });

      await expect(storage.deleteProject(1)).resolves.not.toThrow();
    });
  });

  describe('File operations', () => {
    it('should create file with quota check', async () => {
      const fileData = {
        name: 'test.js',
        path: '/test.js',
        content: 'console.log("test");',
        isFolder: false,
        projectId: 1
      };

      const createdFile = {
        id: 1,
        ...fileData,
        parentId: null,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockDb.transaction.mockImplementation(async (callback) => {
        return await callback({
          select: jest.fn().mockImplementation(() => ({
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockImplementation((condition) => {
                // Mock different responses based on the condition
                if (condition.toString().includes('count')) {
                  return Promise.resolve([{ count: 10 }]); // Under limit
                } else {
                  return { limit: jest.fn().mockResolvedValue([]) }; // No existing file
                }
              })
            })
          })),
          insert: jest.fn().mockReturnValue({
            values: jest.fn().mockReturnValue({
              returning: jest.fn().mockResolvedValue([createdFile])
            })
          })
        });
      });

      const result = await storage.createFile(fileData);
      expect(result).toEqual(createdFile);
    });

    it('should reject file creation when quota exceeded', async () => {
      const fileData = {
        name: 'test.js',
        path: '/test.js',
        content: 'console.log("test");',
        isFolder: false,
        projectId: 1
      };

      mockDb.transaction.mockImplementation(async (callback) => {
        return await callback({
          select: jest.fn().mockReturnValue({
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockResolvedValue([{ count: 1000 }]) // At limit
            })
          })
        });
      });

      await expect(storage.createFile(fileData)).rejects.toThrow('Maximum file limit reached');
    });

    it('should reject duplicate file paths', async () => {
      const fileData = {
        name: 'test.js',
        path: '/test.js',
        content: 'console.log("test");',
        isFolder: false,
        projectId: 1
      };

      const existingFile = { id: 1, ...fileData };

      mockDb.transaction.mockImplementation(async (callback) => {
        return await callback({
          select: jest.fn().mockImplementation(() => ({
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockImplementation((condition) => {
                if (condition.toString().includes('count')) {
                  return Promise.resolve([{ count: 10 }]); // Under limit
                } else {
                  return { limit: jest.fn().mockResolvedValue([existingFile]) }; // Existing file
                }
              })
            })
          }))
        });
      });

      await expect(storage.createFile(fileData)).rejects.toThrow('File already exists');
    });
  });

  describe('Batch operations', () => {
    it('should create files in batch', async () => {
      const filesToCreate = [
        {
          name: 'file1.js',
          path: '/file1.js',
          content: 'console.log("file1");',
          isFolder: false,
          projectId: 1
        },
        {
          name: 'file2.js',
          path: '/file2.js',
          content: 'console.log("file2");',
          isFolder: false,
          projectId: 1
        }
      ];

      const createdFiles = filesToCreate.map((file, index) => ({
        id: index + 1,
        ...file,
        parentId: null,
        createdAt: new Date(),
        updatedAt: new Date()
      }));

      mockDb.transaction.mockImplementation(async (callback) => {
        return await callback({
          insert: jest.fn().mockReturnValue({
            values: jest.fn().mockReturnValue({
              returning: jest.fn().mockResolvedValue(createdFiles)
            })
          })
        });
      });

      const result = await storage.createFilesBatch(filesToCreate);
      expect(result).toEqual(createdFiles);
    });

    it('should handle empty batch gracefully', async () => {
      const result = await storage.createFilesBatch([]);
      expect(result).toEqual([]);
    });
  });

  describe('Health check', () => {
    it('should return healthy status', async () => {
      mockDb.execute.mockResolvedValue(undefined);

      const result = await storage.healthCheck();
      expect(result.status).toBe('healthy');
      expect(typeof result.latency).toBe('number');
    });

    it('should return unhealthy status on database error', async () => {
      mockDb.execute.mockRejectedValue(new Error('Database connection failed'));

      const result = await storage.healthCheck();
      expect(result.status).toBe('unhealthy');
      expect(typeof result.latency).toBe('number');
    });
  });

  describe('Error handling', () => {
    it('should handle database errors gracefully', async () => {
      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockRejectedValue(new Error('Database error'))
          })
        })
      } as any);

      await expect(storage.getUser('user-1')).rejects.toThrow('Failed to retrieve user');
    });
  });
});