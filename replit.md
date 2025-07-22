# Shetty - Cloud IDE Platform

## Overview

Shetty is a comprehensive cloud IDE platform inspired by Replit, designed to provide a complete in-browser development environment. The system enables users to create, edit, and manage projects with real-time collaboration, AI assistance, and live preview capabilities. Now includes VS Code-like file tree synchronization that automatically syncs terminal-created files with the database.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript for type safety and modern development
- **Styling**: TailwindCSS for utility-first styling with custom IDE-specific color variables
- **UI Components**: Shadcn/UI component library providing consistent, accessible components
- **Code Editor**: Monaco Editor integration for professional code editing experience
- **State Management**: React Query (TanStack Query) for server state management with custom hooks
- **Routing**: Wouter for lightweight client-side routing
- **Build Tool**: Vite for fast development and optimized builds

### Backend Architecture
- **Runtime**: Node.js with Express.js server framework
- **Database**: PostgreSQL with Drizzle ORM for type-safe database operations
- **Authentication**: Replit Auth integration with OpenID Connect for secure authentication
- **Session Management**: PostgreSQL-backed sessions with connect-pg-simple
- **API Design**: RESTful API structure with proper error handling and middleware

### Data Storage Solutions
- **Primary Database**: Neon PostgreSQL for scalable cloud database hosting
- **Session Storage**: PostgreSQL sessions table for authentication persistence
- **File Storage**: Database-backed file system with hierarchical project structure

## Key Components

### Database Schema
- **Users Table**: Stores user profile information (id, email, firstName, lastName, profileImageUrl)
- **Projects Table**: Project metadata linked to users with creation/update timestamps
- **Files Table**: Hierarchical file structure with content storage, supporting both files and folders
- **Sessions Table**: Required for Replit Auth integration

### IDE Components
- **File Explorer**: Hierarchical tree view with file/folder creation, navigation, and management
- **Monaco Editor**: Full-featured code editor with syntax highlighting, autocompletion, and themes
- **Tab Management**: Multiple file tabs with close functionality and active file tracking
- **Terminal**: Real xterm.js terminal with node-pty backend for authentic shell experience
- **File System Integration**: Real-time file tree updates using chokidar file watcher
- **AI Assistant**: Chat interface for code assistance and project guidance
- **Preview Panel**: Live preview of project output with mock HTML generation

### File System Synchronization
- **Real-time Sync**: Automatically syncs terminal-created files to database with debounced updates
- **Binary File Handling**: Proper detection and handling of binary files to prevent UTF-8 encoding errors
- **Manual Refresh**: Refresh button with file sync functionality for immediate updates
- **VS Code-like Behavior**: File tree updates exactly like VS Code when terminal commands create/modify files
- **Context Menus**: 3-dot dropdown menus on every file/folder for delete and other operations
- **Smart Filtering**: Excludes problematic directories (node_modules, etc.) to prevent system limits

### Authentication System
- **Replit Auth Integration**: OAuth flow with OpenID Connect for seamless authentication
- **Session Management**: Secure session handling with PostgreSQL storage
- **User Context**: Global authentication state management with React Query

## Data Flow

### Authentication Flow
1. User accesses application
2. Replit Auth middleware checks authentication status
3. Redirect to OAuth flow if unauthenticated
4. Store user session in PostgreSQL upon successful authentication
5. Frontend receives user data via `/api/auth/user` endpoint

### Project Management Flow
1. Fetch user projects via React Query
2. Select/create project through UI interactions
3. Load project files from database
4. Display files in explorer and enable editing
5. Auto-save changes with optimistic updates

### File Editing Flow
1. Open file from explorer to create new tab
2. Load file content in Monaco Editor
3. Real-time content updates with mutation hooks
4. Automatic saving with status indicators
5. Session persistence across browser refreshes

## External Dependencies

### Core Dependencies
- **@neondatabase/serverless**: PostgreSQL database connection
- **drizzle-orm**: Type-safe database operations and schema management
- **@radix-ui/***: Accessible UI component primitives
- **@tanstack/react-query**: Server state management and caching
- **monaco-editor**: Professional code editing capabilities
- **@xterm/xterm**: Professional terminal emulator for web browsers
- **node-pty**: Pseudo terminal for Node.js enabling real shell processes
- **chokidar**: File system watcher for real-time file change detection
- **socket.io**: Real-time bidirectional event-based communication
- **express**: Web server framework
- **passport**: Authentication middleware

### Development Tools
- **TypeScript**: Type safety across frontend and backend
- **Vite**: Development server and build tool
- **Tailwind CSS**: Utility-first CSS framework
- **ESBuild**: Fast JavaScript bundler for production builds

## Deployment Strategy

### Build Process
1. **Frontend Build**: Vite compiles React application to static assets in `dist/public`
2. **Backend Build**: ESBuild bundles server code to `dist/index.js` with external dependencies
3. **Database Migration**: Drizzle handles schema migrations via `db:push` command

### Production Configuration
- **Environment Variables**: DATABASE_URL, SESSION_SECRET, REPL_ID for Replit integration
- **Static Serving**: Express serves built frontend assets in production mode
- **Database**: Neon PostgreSQL with connection pooling for scalability

### Development Setup
- **Hot Reloading**: Vite development server with HMR for frontend changes
- **Server Restart**: tsx for automatic TypeScript compilation and server restart
- **Database**: Development database URL configuration with migration support

The architecture prioritizes developer experience with hot reloading, type safety, and modern tooling while maintaining production readiness with proper authentication, database management, and deployment strategies.