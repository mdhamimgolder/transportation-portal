#!/bin/bash
# Git initialization script for Transportation Management Portal

cd "D:/Devolopment/Transportation System/_archived-fastapi-scaffold-2026-07-27" || exit 1

echo "Initializing git repository..."
git init

echo "Configuring git user..."
git config user.email "developer@transport.local"
git config user.name "Transport Dev Team"

echo "Adding all files..."
git add .

echo "Creating initial commit..."
git commit -m "Initial commit: Transportation Management Portal with full database schema

- FastAPI backend with async SQLAlchemy 2.0
- SQLite for development, PostgreSQL-ready for production
- Database models: users, weekly_requests, adhoc_requests, allocations, address_change_requests, audit_logs, password_reset_tokens
- Role-based access control: employee, operations, facilities, super_admin
- Comprehensive audit logging for compliance
- Timezone handling (Asia/Dhaka)
- Alembic migrations for schema versioning
- React frontend with TailwindCSS and dark theme
- Complete database documentation and feature development guide"

echo ""
echo "Git repository status:"
git log --oneline -n 3
echo ""
git status
echo ""
echo "✓ Git repository initialized successfully!"
echo ""
echo "To push to a remote repository, run:"
echo "  git remote add origin <your-repo-url>"
echo "  git branch -M main"
echo "  git push -u origin main"
