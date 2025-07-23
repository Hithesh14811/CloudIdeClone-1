import { beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';

// Mock environment variables for testing
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://test:test@localhost:5432/shetty_test';
process.env.SESSION_SECRET = 'test-session-secret-for-testing-only';
process.env.REPL_ID = 'test-repl-id';
process.env.REPLIT_DOMAINS = 'localhost,127.0.0.1';

// Mock console methods to reduce noise in tests
const originalConsole = { ...console };

beforeAll(() => {
  // Suppress console output during tests unless VERBOSE_TESTS is set
  if (!process.env.VERBOSE_TESTS) {
    console.log = jest.fn();
    console.info = jest.fn();
    console.warn = jest.fn();
    console.error = jest.fn();
  }
});

afterAll(() => {
  // Restore console methods
  if (!process.env.VERBOSE_TESTS) {
    console.log = originalConsole.log;
    console.info = originalConsole.info;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
  }
});

// Global test utilities
declare global {
  namespace NodeJS {
    interface Global {
      testDb: any;
    }
  }
}

// Mock Socket.IO for tests
jest.mock('socket.io', () => {
  return {
    Server: jest.fn().mockImplementation(() => ({
      on: jest.fn(),
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
      use: jest.fn(),
      close: jest.fn()
    }))
  };
});

// Mock file system operations for tests
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  mkdirSync: jest.fn(),
  rmSync: jest.fn(),
  unlinkSync: jest.fn(),
  lstatSync: jest.fn(),
  readdirSync: jest.fn()
}));

// Mock Docker operations for tests
jest.mock('../services/docker', () => ({
  dockerService: {
    createContainer: jest.fn(),
    executeCommand: jest.fn(),
    destroyContainer: jest.fn(),
    getSession: jest.fn(),
    getAllSessions: jest.fn().mockReturnValue([]),
    healthCheck: jest.fn().mockResolvedValue({
      status: 'healthy',
      dockerAvailable: false,
      activeSessions: 0
    })
  }
}));

export {};