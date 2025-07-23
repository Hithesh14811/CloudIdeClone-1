import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import cors from 'cors';
import { body, param, query, validationResult } from 'express-validator';
import type { Request, Response, NextFunction } from 'express';

// Rate limiting configurations
export const generalRateLimit = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes default
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'), // 100 requests per window
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    console.log(`Rate limit exceeded for IP: ${req.ip}, path: ${req.path}`);
    res.status(429).json({
      error: 'Too many requests from this IP, please try again later.',
      retryAfter: '15 minutes'
    });
  }
});

export const strictRateLimit = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
  max: 20, // Stricter limit for sensitive operations
  message: {
    error: 'Too many requests for this operation, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false
});

export const aiRateLimit = rateLimit({
  windowMs: 60000, // 1 minute
  max: parseInt(process.env.AI_RATE_LIMIT_MAX_REQUESTS || '10'), // 10 AI requests per minute
  message: {
    error: 'Too many AI requests, please try again later.',
    retryAfter: '1 minute'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => {
    // Rate limit per user for AI requests
    return req.user?.claims?.sub || req.ip;
  }
});

// Security headers configuration
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      scriptSrc: ["'self'", "'unsafe-eval'"], // Monaco Editor needs unsafe-eval
      connectSrc: ["'self'", "ws:", "wss:"],
      frameSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      workerSrc: ["'self'", "blob:"],
      childSrc: ["'self'", "blob:"],
      formAction: ["'self'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: false, // Disabled for Monaco Editor compatibility
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
});

// CORS configuration
export const corsConfig = cors({
  origin: (origin, callback) => {
    const allowedOrigins = process.env.CORS_ORIGIN 
      ? process.env.CORS_ORIGIN.split(',')
      : ['http://localhost:5000', 'http://localhost:3000'];
    
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining']
});

// Input validation schemas
export const validateProjectId = [
  param('id').isInt({ min: 1 }).withMessage('Project ID must be a positive integer'),
  param('projectId').optional().isInt({ min: 1 }).withMessage('Project ID must be a positive integer')
];

export const validateFileId = [
  param('id').isInt({ min: 1 }).withMessage('File ID must be a positive integer')
];

export const validateCreateProject = [
  body('name')
    .isLength({ min: 1, max: 255 })
    .withMessage('Project name must be between 1 and 255 characters')
    .matches(/^[a-zA-Z0-9\s\-_\.]+$/)
    .withMessage('Project name contains invalid characters'),
  body('description')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Description must be less than 1000 characters')
];

export const validateCreateFile = [
  body('name')
    .isLength({ min: 1, max: 255 })
    .withMessage('File name must be between 1 and 255 characters')
    .matches(/^[a-zA-Z0-9\s\-_\.\/]+$/)
    .withMessage('File name contains invalid characters'),
  body('path')
    .isLength({ min: 1, max: 500 })
    .withMessage('File path must be between 1 and 500 characters')
    .custom((value) => {
      // Prevent directory traversal
      if (value.includes('..') || value.includes('~')) {
        throw new Error('File path contains invalid sequences');
      }
      return true;
    }),
  body('content')
    .optional()
    .isLength({ max: parseInt(process.env.MAX_FILE_SIZE_MB || '10') * 1024 * 1024 })
    .withMessage(`File content exceeds maximum size of ${process.env.MAX_FILE_SIZE_MB || '10'}MB`),
  body('isFolder')
    .isBoolean()
    .withMessage('isFolder must be a boolean')
];

export const validateUpdateFile = [
  body('content')
    .optional()
    .isLength({ max: parseInt(process.env.MAX_FILE_SIZE_MB || '10') * 1024 * 1024 })
    .withMessage(`File content exceeds maximum size of ${process.env.MAX_FILE_SIZE_MB || '10'}MB`),
  body('name')
    .optional()
    .isLength({ min: 1, max: 255 })
    .withMessage('File name must be between 1 and 255 characters')
    .matches(/^[a-zA-Z0-9\s\-_\.\/]+$/)
    .withMessage('File name contains invalid characters')
];

export const validateAiChat = [
  body('message')
    .isLength({ min: 1, max: 2000 })
    .withMessage('Message must be between 1 and 2000 characters')
    .custom((value) => {
      // Basic content filtering
      const dangerousPatterns = [
        /eval\s*\(/i,
        /function\s*\(/i,
        /javascript:/i,
        /<script/i,
        /on\w+\s*=/i
      ];
      
      for (const pattern of dangerousPatterns) {
        if (pattern.test(value)) {
          throw new Error('Message contains potentially dangerous content');
        }
      }
      return true;
    }),
  body('projectId')
    .isInt({ min: 1 })
    .withMessage('Project ID must be a positive integer')
];

export const validatePagination = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
];

// Validation error handler
export const handleValidationErrors = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    console.log(`Validation errors for ${req.method} ${req.path}:`, errors.array());
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array().map(error => ({
        field: error.type === 'field' ? error.path : 'unknown',
        message: error.msg,
        value: error.type === 'field' ? error.value : undefined
      }))
    });
  }
  next();
};

// Request logging middleware
export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  const originalSend = res.json;
  
  res.json = function(body) {
    const duration = Date.now() - start;
    const logData = {
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.path,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      duration: `${duration}ms`,
      status: res.statusCode,
      userId: (req as any).user?.claims?.sub || 'anonymous'
    };
    
    // Log errors and slow requests
    if (res.statusCode >= 400 || duration > 1000) {
      console.log('Request log:', JSON.stringify(logData));
    }
    
    return originalSend.call(this, body);
  };
  
  next();
};

// User quota validation middleware
export const validateUserQuotas = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { storage } = await import('../storage');
    
    // Check project quota for project creation
    if (req.method === 'POST' && req.path.includes('/projects') && !req.path.includes('/files')) {
      const userProjects = await storage.getUserProjects(userId);
      const maxProjects = parseInt(process.env.MAX_PROJECTS_PER_USER || '50');
      
      if (userProjects.length >= maxProjects) {
        return res.status(429).json({
          error: `Maximum number of projects reached (${maxProjects})`,
          current: userProjects.length,
          limit: maxProjects
        });
      }
    }
    
    // Check file quota for file creation
    if (req.method === 'POST' && req.path.includes('/files')) {
      const projectId = parseInt(req.params.projectId);
      const projectFiles = await storage.getProjectFiles(projectId);
      const maxFiles = parseInt(process.env.MAX_FILES_PER_PROJECT || '1000');
      
      if (projectFiles.length >= maxFiles) {
        return res.status(429).json({
          error: `Maximum number of files reached for this project (${maxFiles})`,
          current: projectFiles.length,
          limit: maxFiles
        });
      }
    }
    
    next();
  } catch (error) {
    console.error('Error validating user quotas:', error);
    next(); // Continue on quota check failure
  }
};

// Error response sanitizer
export const sanitizeErrorResponse = (err: any, req: Request, res: Response, next: NextFunction) => {
  // Log the full error for debugging
  console.error('Application error:', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    userId: (req as any).user?.claims?.sub || 'anonymous',
    timestamp: new Date().toISOString()
  });

  // Send sanitized error to client
  const status = err.status || err.statusCode || 500;
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  res.status(status).json({
    error: isDevelopment ? err.message : 'Internal server error',
    ...(isDevelopment && { stack: err.stack }),
    timestamp: new Date().toISOString(),
    requestId: req.headers['x-request-id'] || 'unknown'
  });
};

// Health check endpoint
export const healthCheck = async (req: Request, res: Response) => {
  try {
    const { dockerService } = await import('../services/docker');
    const dockerHealth = await dockerService.healthCheck();
    
    // Check database connection
    let dbHealth = { status: 'unknown', connected: false };
    try {
      const { db } = await import('../db');
      await db.execute('SELECT 1');
      dbHealth = { status: 'healthy', connected: true };
    } catch (error) {
      dbHealth = { status: 'unhealthy', connected: false };
    }
    
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      database: dbHealth,
      docker: dockerHealth,
      environment: process.env.NODE_ENV || 'development'
    };
    
    res.json(health);
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: 'Health check failed',
      timestamp: new Date().toISOString()
    });
  }
};