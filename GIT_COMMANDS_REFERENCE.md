# Git Commands Reference for Transportation Management Portal

## Quick Git Cheat Sheet

### View Status & History
```bash
# See what changed
git status

# View last 5 commits
git log --oneline -n 5

# See detailed changes in a commit
git show <commit-hash>

# See who changed what line
git blame <file>
```

### Making Changes
```bash
# Stage specific files
git add backend/app/models/user.py frontend/src/pages/

# Stage all changes
git add .

# Stage only modifications (not new files)
git add -u

# Interactive staging (choose which hunks to add)
git add -p

# See what will be committed
git diff --staged
```

### Creating Commits
```bash
# Simple commit
git commit -m "Short description"

# Detailed commit
git commit -m "Short description

- Detailed point 1
- Detailed point 2
- Closes issue #123"

# Amend last commit (only if not pushed!)
git commit --amend --no-edit

# Amend with new message
git commit --amend -m "New message"
```

### Branches
```bash
# List all branches
git branch -a

# Create new branch
git checkout -b feature/new-feature

# Switch to existing branch
git checkout main

# Delete branch (local)
git branch -d feature/old-feature

# Delete branch (force)
git branch -D feature/old-feature
```

### Pushing & Pulling
```bash
# Push current branch
git push

# Push new branch (set upstream)
git push -u origin feature/new-feature

# Push to specific branch
git push origin main

# Pull latest changes
git pull

# Pull with rebase (cleaner history)
git pull --rebase
```

### Remote Management
```bash
# List remotes
git remote -v

# Add new remote
git remote add origin https://github.com/user/repo.git

# Change remote URL
git remote set-url origin https://github.com/user/repo.git

# Remove remote
git remote remove origin
```

### Undoing Changes
```bash
# Discard changes in working directory
git checkout -- <file>

# Unstage file
git reset HEAD <file>

# Undo last commit (keep changes)
git reset --soft HEAD~1

# Undo last commit (discard changes)
git reset --hard HEAD~1

# Revert a commit (create new commit that undoes it)
git revert <commit-hash>
```

---

## Feature Branch Workflow (Recommended)

```bash
# 1. Start from main
git checkout main
git pull origin main

# 2. Create feature branch
git checkout -b feature/your-feature-name

# 3. Make changes and commit
git add .
git commit -m "feat: Add your feature

- Description
- Key changes"

# 4. Push to remote
git push -u origin feature/your-feature-name

# 5. When done, create Pull Request on GitHub/GitLab/Bitbucket
#    (Review, get approvals, merge via web UI)

# 6. Switch back to main
git checkout main
git pull origin main
```

---

## Commit Message Convention

Follow this format for clarity:

```
<type>: <subject>

<body>

<footer>
```

### Types:
- `feat:` — New feature
- `fix:` — Bug fix
- `refactor:` — Code restructure (no feature/fix)
- `test:` — Test additions/updates
- `docs:` — Documentation
- `style:` — Formatting (spaces, commas, etc.)
- `chore:` — Dependencies, config, build

### Examples:

**Simple feature:**
```
feat: Add driver performance dashboard

- Query allocations grouped by driver
- Calculate satisfaction rating average
- Display in Super Admin panel
```

**Bug fix:**
```
fix: Prevent duplicate weekly submissions

- Add unique constraint on (employee_id, week_start_date)
- Return 409 Conflict if duplicate detected
- Add test for duplicate prevention
```

**Database change:**
```
feat: Add satisfaction rating to allocations

- Add satisfaction_rating (1-5) and rating_notes columns
- Create Alembic migration
- Endpoint for employees to rate allocations
- Include in audit logs
```

---

## Typical Development Cycle

### 1. Plan the Feature
```bash
# Create issue/task with requirements
# Example: "Add email notifications for operations"
```

### 2. Create Feature Branch
```bash
git checkout main
git pull origin main
git checkout -b feature/operations-email-notifications
```

### 3. Database Changes (if needed)
```bash
# Update model
nano backend/app/models/adhoc.py

# Generate migration
cd backend
alembic revision --autogenerate -m "Add notification_sent_at to adhoc_requests"

# Test locally
alembic upgrade head
```

### 4. Backend Implementation
```bash
# Create API endpoint
nano backend/app/api/v1/notifications.py

# Create schema
nano backend/app/schemas/notification.py

# Update service
nano backend/app/services/notification_service.py

# Add tests
nano backend/tests/test_notifications.py
```

### 5. Frontend Implementation
```bash
# Create page/component
nano frontend/src/pages/notifications.tsx

# Create API client
nano frontend/src/api/notifications.ts

# Add query hook
nano frontend/src/hooks/useNotifications.ts
```

### 6. Code Quality
```bash
cd backend
black app/
ruff check app/ --fix

cd ../frontend
prettier src/ --write
eslint src/ --fix
```

### 7. Testing
```bash
# Run backend tests
cd backend
pytest tests/test_notifications.py -v

# Run coverage
pytest tests/ --cov=app
```

### 8. Commit Changes
```bash
# Stage all
git add .

# Commit with detailed message
git commit -m "feat: Add email notifications for operations

- New endpoint: GET /api/v1/notifications
- Operations receive email on ad-hoc request submission
- Database: Add notification_sent_at to adhoc_requests
- Frontend: Notification preferences page
- Tests: Permission checks, email delivery
- Audit: Log all notification events"

# Push to remote
git push origin feature/operations-email-notifications
```

### 9. Create Pull Request
```bash
# On GitHub/GitLab/Bitbucket, create PR:
# - Title: "feat: Add email notifications for operations"
# - Description: Link to issue, describe changes, note any breaking changes
# - Request review from team
```

### 10. Merge to Main
```bash
# After approval:
git checkout main
git pull origin main
git merge feature/operations-email-notifications
git push origin main

# Delete feature branch
git branch -d feature/operations-email-notifications
git push origin --delete feature/operations-email-notifications
```

---

## Common Issues & Solutions

### Issue: "I committed something by mistake"
```bash
# Haven't pushed yet?
git reset --soft HEAD~1  # Keep changes, undo commit

# Already pushed?
git revert <commit-hash>  # Create new commit that undoes it
```

### Issue: "I want to switch branches but have uncommitted changes"
```bash
# Option 1: Commit your changes
git add .
git commit -m "WIP: Work in progress"

# Option 2: Stash (temporary storage)
git stash
git checkout other-branch
# ... do work ...
git checkout original-branch
git stash pop  # Restore stashed changes
```

### Issue: "I merged the wrong branch"
```bash
# Undo merge (if not pushed)
git reset --hard HEAD~1

# Revert merge (if already pushed)
git revert -m 1 <merge-commit-hash>
```

### Issue: "My branch is behind main"
```bash
git fetch origin
git rebase origin/main
# or
git merge origin/main
```

### Issue: "I need to see all changes since last commit"
```bash
# Changes not staged
git diff

# Changes staged
git diff --staged

# Changes in specific file
git diff backend/app/models/user.py
```

---

## Best Practices

### Do ✅
- ✅ Create feature branches for every change
- ✅ Make small, focused commits
- ✅ Write clear commit messages
- ✅ Pull before pushing
- ✅ Test before committing
- ✅ Review your own changes before requesting review
- ✅ Keep commits atomic (each commit does one thing)

### Don't ❌
- ❌ Commit directly to main
- ❌ Use `git push --force` (unless you really know what you're doing)
- ❌ Mix unrelated changes in one commit
- ❌ Commit passwords, tokens, or secrets
- ❌ Commit large binary files
- ❌ Ignore `.gitignore` for convenience

---

## Setup for This Project

### First Time Setup
```bash
cd "D:/Devolopment/Transportation System/_archived-fastapi-scaffold-2026-07-27"

# Verify git is initialized
git status

# See commit history
git log --oneline -n 5

# See all branches
git branch -a
```

### Add Remote Repository (GitHub Example)
```bash
# Create repo on GitHub first, then:
git remote add origin https://github.com/yourusername/transport-portal.git
git branch -M main
git push -u origin main

# Verify
git remote -v
```

### Daily Workflow
```bash
# Start of day: pull latest
git checkout main
git pull origin main

# Create feature branch
git checkout -b feature/my-feature

# Make changes, test, commit
git add .
git commit -m "feat: ..."

# Push regularly
git push origin feature/my-feature

# End of day: push any uncommitted work
git add .
git commit -m "WIP: ..."
git push origin feature/my-feature
```

---

## Integration with CI/CD (Future)

When you set up CI/CD (GitHub Actions, GitLab CI, etc.), add:

```yaml
# .github/workflows/tests.yml (example)
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Run backend tests
        run: cd backend && pytest tests/
      - name: Run linter
        run: cd backend && ruff check app/
```

This automatically runs tests and linting on every push.

---

## Quick Reference Card

```
┌─────────────────────────────────────────────┐
│  GIT QUICK REFERENCE - COPY THIS            │
├─────────────────────────────────────────────┤
│  Status & History                           │
│  git status                                 │
│  git log --oneline -n 5                     │
│                                             │
│  Making Changes                             │
│  git add .                                  │
│  git commit -m "message"                    │
│                                             │
│  Branches                                   │
│  git checkout -b feature/name               │
│  git checkout main                          │
│                                             │
│  Push & Pull                                │
│  git pull origin main                       │
│  git push origin feature/name               │
│                                             │
│  Undo                                       │
│  git reset --soft HEAD~1                    │
│  git checkout -- file.py                    │
└─────────────────────────────────────────────┘
```

---

## You're Ready!

Git is now initialized for your Transportation Management Portal. Start developing and committing with confidence! 🚀
