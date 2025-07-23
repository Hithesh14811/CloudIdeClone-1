import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";
import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";
import { randomBytes } from "crypto";

if (!process.env.REPLIT_DOMAINS) {
  throw new Error("Environment variable REPLIT_DOMAINS not provided");
}

if (!process.env.SESSION_SECRET) {
  throw new Error("Environment variable SESSION_SECRET not provided");
}

const getOidcConfig = memoize(
  async () => {
    return await client.discovery(
      new URL(process.env.ISSUER_URL ?? "https://replit.com/oidc"),
      process.env.REPL_ID!
    );
  },
  { maxAge: 3600 * 1000 }
);

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  
  const isProduction = process.env.NODE_ENV === "production";
  
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    name: 'shetty.sid', // Custom session name for security
    genid: () => {
      // Generate cryptographically secure session ID
      return randomBytes(32).toString('hex');
    },
    cookie: {
      httpOnly: true,
      secure: isProduction, // Only secure in production
      maxAge: sessionTtl,
      sameSite: isProduction ? "strict" : "lax", // More flexible in development
      domain: isProduction ? process.env.COOKIE_DOMAIN : undefined,
    },
    rolling: true, // Reset expiration on activity
  });
}

function updateUserSession(
  user: any,
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers
) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
  user.last_activity = Date.now();
  user.session_id = randomBytes(16).toString('hex'); // Add session tracking
}

async function upsertUser(claims: any) {
  try {
    await storage.upsertUser({
      id: claims["sub"],
      email: claims["email"],
      firstName: claims["first_name"],
      lastName: claims["last_name"],
      profileImageUrl: claims["profile_image_url"],
    });
  } catch (error) {
    console.error('Error upserting user:', error);
    throw new Error('Failed to create/update user profile');
  }
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  // Add CSRF protection for state parameter
  const csrfTokens = new Map<string, { timestamp: number; userId?: string }>();
  
  // Clean up expired CSRF tokens every hour
  setInterval(() => {
    const now = Date.now();
    for (const [token, data] of csrfTokens.entries()) {
      if (now - data.timestamp > 3600000) { // 1 hour
        csrfTokens.delete(token);
      }
    }
  }, 3600000);

  const config = await getOidcConfig();

  const verify: VerifyFunction = async (
    tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
    verified: passport.AuthenticateCallback
  ) => {
    try {
      const user = {};
      updateUserSession(user, tokens);
      await upsertUser(tokens.claims());
      verified(null, user);
    } catch (error) {
      console.error('Authentication verification failed:', error);
      verified(error, null);
    }
  };

  for (const domain of process.env.REPLIT_DOMAINS!.split(",")) {
    const strategy = new Strategy(
      {
        name: `replitauth:${domain}`,
        config,
        scope: "openid email profile offline_access",
        callbackURL: `https://${domain}/api/callback`,
      },
      verify,
    );
    passport.use(strategy);
  }

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  app.get("/api/login", (req, res, next) => {
    // Generate CSRF token for state parameter
    const csrfToken = randomBytes(32).toString('hex');
    csrfTokens.set(csrfToken, { timestamp: Date.now() });
    
    passport.authenticate(`replitauth:${req.hostname}`, {
      prompt: "login consent",
      scope: ["openid", "email", "profile", "offline_access"],
      state: csrfToken,
    })(req, res, next);
  });

  app.get("/api/callback", (req, res, next) => {
    // Verify CSRF token from state parameter
    const state = req.query.state as string;
    if (!state || !csrfTokens.has(state)) {
      console.error('Invalid or missing CSRF token in callback');
      return res.status(400).json({ error: 'Invalid authentication state' });
    }
    
    // Clean up used token
    csrfTokens.delete(state);
    
    passport.authenticate(`replitauth:${req.hostname}`, {
      successReturnToOrRedirect: "/",
      failureRedirect: "/api/login",
      failureFlash: false,
    })(req, res, next);
  });

  app.get("/api/logout", (req, res) => {
    const user = req.user as any;
    
    req.logout((err) => {
      if (err) {
        console.error('Logout error:', err);
        return res.status(500).json({ error: 'Logout failed' });
      }
      
      // Destroy session
      req.session.destroy((destroyErr) => {
        if (destroyErr) {
          console.error('Session destruction error:', destroyErr);
        }
      });
      
      // Redirect to OIDC logout if available
      try {
        const logoutUrl = client.buildEndSessionUrl(config, {
          client_id: process.env.REPL_ID!,
          post_logout_redirect_uri: `${req.protocol}://${req.hostname}`,
          id_token_hint: user?.id_token,
        }).href;
        
        res.redirect(logoutUrl);
      } catch (error) {
        console.error('OIDC logout error:', error);
        res.redirect('/');
      }
    });
  });

  // Session health endpoint
  app.get("/api/auth/session", (req, res) => {
    const user = req.user as any;
    if (!req.isAuthenticated() || !user) {
      return res.status(401).json({ 
        authenticated: false,
        error: 'Not authenticated'
      });
    }

    res.json({
      authenticated: true,
      expires_at: user.expires_at,
      last_activity: user.last_activity,
      session_id: user.session_id,
      user_id: user.claims?.sub
    });
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const user = req.user as any;

  if (!req.isAuthenticated() || !user?.expires_at) {
    return res.status(401).json({ 
      error: "Authentication required",
      code: "AUTH_REQUIRED"
    });
  }

  const now = Math.floor(Date.now() / 1000);
  
  // Check if token is expired
  if (now >= user.expires_at) {
    const refreshToken = user.refresh_token;
    if (!refreshToken) {
      return res.status(401).json({ 
        error: "Session expired",
        code: "SESSION_EXPIRED"
      });
    }

    try {
      console.log('Refreshing expired token for user:', user.claims?.sub);
      const config = await getOidcConfig();
      const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
      updateUserSession(user, tokenResponse);
      
      // Update last activity
      user.last_activity = Date.now();
      
      console.log('Token refreshed successfully');
      return next();
    } catch (error) {
      console.error('Token refresh failed:', error);
      
      // Clear the invalid session
      req.logout((logoutErr) => {
        if (logoutErr) console.error('Logout error:', logoutErr);
      });
      
      return res.status(401).json({ 
        error: "Session expired and refresh failed",
        code: "REFRESH_FAILED"
      });
    }
  }

  // Update last activity for session tracking
  user.last_activity = Date.now();
  
  // Check for session hijacking (basic check)
  const userAgent = req.get('User-Agent');
  const ip = req.ip;
  
  if (user.user_agent && user.user_agent !== userAgent) {
    console.warn(`Potential session hijacking detected: User ${user.claims?.sub}, IP: ${ip}`);
    // In production, you might want to invalidate the session here
  }
  
  // Store current user agent and IP for future checks
  user.user_agent = userAgent;
  user.ip = ip;

  return next();
};

// Enhanced authentication middleware with additional security checks
export const requireAuth = async (req: any, res: any, next: any) => {
  try {
    await isAuthenticated(req, res, next);
  } catch (error) {
    console.error('Authentication middleware error:', error);
    res.status(500).json({ 
      error: 'Authentication system error',
      code: 'AUTH_SYSTEM_ERROR'
    });
  }
};

// Admin authentication middleware
export const requireAdmin = async (req: any, res: any, next: any) => {
  await isAuthenticated(req, res, async () => {
    const user = req.user;
    const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(email => email.trim());
    
    if (!adminEmails.includes(user.claims?.email)) {
      return res.status(403).json({ 
        error: 'Admin access required',
        code: 'ADMIN_REQUIRED'
      });
    }
    
    next();
  });
};

// Rate limiting per user
export const createUserRateLimit = (windowMs: number, max: number) => {
  const userLimits = new Map<string, { count: number; resetTime: number }>();
  
  return (req: any, res: any, next: any) => {
    const userId = req.user?.claims?.sub || req.ip;
    const now = Date.now();
    
    const userLimit = userLimits.get(userId);
    
    if (!userLimit || now > userLimit.resetTime) {
      userLimits.set(userId, { count: 1, resetTime: now + windowMs });
      return next();
    }
    
    if (userLimit.count >= max) {
      return res.status(429).json({
        error: 'Rate limit exceeded for user',
        resetTime: userLimit.resetTime,
        code: 'USER_RATE_LIMIT'
      });
    }
    
    userLimit.count++;
    next();
  };
};
