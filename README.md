# Shetty IDE - Production-Grade Cloud IDE Platform

[![CI/CD Pipeline](https://github.com/your-username/shetty-ide/workflows/CI/CD%20Pipeline/badge.svg)](https://github.com/your-username/shetty-ide/actions)
[![Security Rating](https://img.shields.io/badge/security-A+-green)](https://github.com/your-username/shetty-ide)
[![Coverage](https://img.shields.io/codecov/c/github/your-username/shetty-ide)](https://codecov.io/gh/your-username/shetty-ide)

A comprehensive, production-ready cloud IDE platform inspired by Replit, built with modern technologies and enterprise-grade security.

## 🚀 Features

### Core IDE Features
- **Monaco Editor**: Full-featured code editor with syntax highlighting, auto-completion, and IntelliSense
- **Real-time File Tree**: Live file synchronization with terminal operations
- **Secure Terminal**: Docker-containerized terminal execution with security isolation
- **Live Preview**: Real-time preview with hot reload capabilities
- **AI Assistant**: Integrated AI-powered code assistance and generation

### Production-Grade Security
- **Docker Isolation**: All user code runs in secure Docker containers
- **Rate Limiting**: Comprehensive API rate limiting and abuse prevention
- **Input Validation**: Strict input validation and sanitization
- **CSRF Protection**: Cross-site request forgery protection
- **Security Headers**: Comprehensive security headers (HSTS, CSP, etc.)
- **Authentication**: Secure session management with Replit Auth integration

### Enterprise Features
- **Database Transactions**: ACID-compliant database operations
- **File Locking**: Atomic file operations preventing race conditions
- **User Quotas**: Configurable limits for projects and files per user
- **Health Monitoring**: Comprehensive health checks and monitoring
- **Graceful Shutdown**: Proper cleanup of resources and connections
- **Error Handling**: Robust error handling with sanitized responses

## 🛠 Technology Stack

### Frontend
- **React 18** with TypeScript
- **Vite** for fast development and optimized builds
- **TailwindCSS** for utility-first styling
- **Shadcn/UI** for consistent component library
- **Monaco Editor** for code editing
- **XTerm.js** for terminal emulation

### Backend
- **Node.js** with Express.js
- **TypeScript** for type safety
- **PostgreSQL** with Drizzle ORM
- **Socket.IO** for real-time communication
- **Docker** for secure code execution
- **Jest** for comprehensive testing

### Security & DevOps
- **Helmet.js** for security headers
- **Express Rate Limit** for API protection
- **Express Validator** for input validation
- **Docker** for containerization
- **GitHub Actions** for CI/CD
- **Trivy** for vulnerability scanning

## 🚦 Quick Start

### Prerequisites
- Node.js 18+ 
- PostgreSQL 15+
- Docker (for secure terminal execution)
- Git

### Environment Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-username/shetty-ide.git
   cd shetty-ide
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Configuration**
   ```bash
   cp .env.example .env
   ```
   
   Configure the following required variables in `.env`:
   ```env
   # Database
   DATABASE_URL=postgresql://username:password@host:port/database?sslmode=require
   
   # Security
   SESSION_SECRET=your-super-secure-random-session-secret-at-least-32-characters-long
   
   # Replit Integration (if using Replit Auth)
   REPL_ID=your-repl-id
   REPLIT_DOMAINS=your-domain.com
   ISSUER_URL=https://replit.com/oidc
   
   # Application
   NODE_ENV=development
   PORT=5000
   ```

4. **Database Setup**
   ```bash
   npm run db:push
   ```

5. **Start Development Server**
   ```bash
   npm run dev
   ```

The application will be available at `http://localhost:5000`

## 🏗 Production Deployment

### Docker Deployment (Recommended)

1. **Build Docker Image**
   ```bash
   npm run docker:build
   ```

2. **Run Container**
   ```bash
   docker run -d \
     --name shetty-ide \
     -p 5000:5000 \
     -e DATABASE_URL="your-production-database-url" \
     -e SESSION_SECRET="your-production-session-secret" \
     -e NODE_ENV="production" \
     --restart unless-stopped \
     shetty-ide
   ```

### Manual Deployment

1. **Build Application**
   ```bash
   npm run build
   ```

2. **Start Production Server**
   ```bash
   npm start
   ```

### Environment Variables (Production)

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string | `postgresql://user:pass@host:5432/db` |
| `SESSION_SECRET` | ✅ | Session encryption secret (32+ chars) | `super-secure-random-string` |
| `NODE_ENV` | ✅ | Environment mode | `production` |
| `PORT` | ❌ | Server port | `5000` |
| `REPL_ID` | ❌ | Replit integration ID | `your-repl-id` |
| `REPLIT_DOMAINS` | ❌ | Allowed domains for auth | `domain1.com,domain2.com` |
| `CORS_ORIGIN` | ❌ | CORS allowed origins | `https://yourdomain.com` |
| `MAX_PROJECTS_PER_USER` | ❌ | Project quota per user | `50` |
| `MAX_FILES_PER_PROJECT` | ❌ | File quota per project | `1000` |
| `MAX_FILE_SIZE_MB` | ❌ | Maximum file size | `10` |
| `DOCKER_ENABLED` | ❌ | Enable Docker isolation | `true` |
| `ADMIN_EMAILS` | ❌ | Admin user emails | `admin@domain.com` |

## 🧪 Testing

### Run Tests
```bash
# Unit tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage

# CI mode
npm run test:ci
```

### Security Audit
```bash
npm run audit:security
```

## 🔒 Security Considerations

### Production Security Checklist

- [ ] **Environment Variables**: All secrets stored securely, not in code
- [ ] **Database**: Connection string uses SSL (`sslmode=require`)
- [ ] **Session Secret**: Strong, randomly generated secret (32+ characters)
- [ ] **HTTPS**: Application served over HTTPS in production
- [ ] **Docker**: Container runs as non-root user
- [ ] **Rate Limiting**: API endpoints protected against abuse
- [ ] **Input Validation**: All user inputs validated and sanitized
- [ ] **CORS**: Configured for specific origins only
- [ ] **Security Headers**: CSP, HSTS, and other security headers enabled
- [ ] **Dependencies**: Regular security audits and updates

### Security Features

1. **Container Isolation**: User code runs in isolated Docker containers
2. **Command Sanitization**: Dangerous commands filtered and blocked
3. **File Path Validation**: Directory traversal protection
4. **Rate Limiting**: Per-IP and per-user rate limiting
5. **Session Security**: Secure session management with expiration
6. **Input Validation**: Comprehensive input validation and sanitization
7. **Error Sanitization**: Error messages sanitized before client response

## 📊 Monitoring & Health Checks

### Health Check Endpoint
```bash
curl http://localhost:5000/api/health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2025-01-23T10:00:00.000Z",
  "version": "1.0.0",
  "uptime": 3600,
  "memory": {
    "rss": 134217728,
    "heapTotal": 67108864,
    "heapUsed": 45088768,
    "external": 2097152
  },
  "database": {
    "status": "healthy",
    "connected": true
  },
  "docker": {
    "status": "healthy",
    "dockerAvailable": true,
    "activeSessions": 0
  }
}
```

### Monitoring Recommendations

- **Application Performance Monitoring**: Integrate with APM tools (New Relic, Datadog)
- **Error Tracking**: Use error tracking services (Sentry, Bugsnag)
- **Log Management**: Centralized logging (ELK Stack, Splunk)
- **Infrastructure Monitoring**: Server and container monitoring
- **Database Monitoring**: Query performance and connection monitoring

## 🚀 Performance Optimization

### Database Optimization
- Connection pooling enabled
- Query optimization with proper indexes
- Database transactions for consistency
- Batch operations for bulk data

### Caching Strategy
- Database query result caching
- Static asset caching
- Session caching in PostgreSQL
- File system caching for frequently accessed files

### Resource Management
- Docker container resource limits
- File size and count quotas
- Memory usage monitoring
- Connection pooling and cleanup

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Follow TypeScript best practices
- Write comprehensive tests for new features
- Ensure security considerations are addressed
- Update documentation for API changes
- Run linting and tests before submitting

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support & Troubleshooting

### Common Issues

1. **Database Connection Errors**
   - Verify `DATABASE_URL` is correct
   - Ensure PostgreSQL is running and accessible
   - Check SSL configuration for production

2. **Docker Issues**
   - Ensure Docker daemon is running
   - Check Docker permissions for non-root users
   - Verify container resource limits

3. **Authentication Problems**
   - Verify Replit Auth configuration
   - Check `SESSION_SECRET` is set
   - Ensure domains are correctly configured

### Getting Help

- 📖 [Documentation](https://github.com/your-username/shetty-ide/wiki)
- 🐛 [Issue Tracker](https://github.com/your-username/shetty-ide/issues)
- 💬 [Discussions](https://github.com/your-username/shetty-ide/discussions)

## 🎯 Roadmap

- [ ] **Advanced Editor Features**: Code completion, linting, formatting
- [ ] **Collaboration**: Real-time collaborative editing
- [ ] **Version Control**: Integrated Git support
- [ ] **Deployment Integration**: One-click deployment to cloud platforms
- [ ] **Plugin System**: Extensible plugin architecture
- [ ] **Mobile Support**: Responsive design for mobile devices
- [ ] **Offline Mode**: Progressive Web App capabilities

---

**Built with ❤️ for developers, by developers.**