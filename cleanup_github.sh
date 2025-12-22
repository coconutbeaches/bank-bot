#!/bin/bash

# GitHub Repository Cleanup Script
# This script removes sensitive files from git history and updates the remote repo

set -e  # Exit on any error

echo "🔐 GitHub Repository Cleanup Script"
echo "===================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if we're in the right directory
if [ ! -f "process_bbl_slips.ts" ]; then
    echo -e "${RED}Error: Not in the bank-bot directory${NC}"
    echo "Please run this from /Users/tyler/Projects/bank-bot"
    exit 1
fi

echo -e "${YELLOW}Step 1: Removing sensitive files from local directory${NC}"
echo "------------------------------------------------------"

# Remove the credentials file
if [ -f "coco-gpt-tm30-225b147529bc.json" ]; then
    rm coco-gpt-tm30-225b147529bc.json
    echo -e "${GREEN}✓ Deleted coco-gpt-tm30-225b147529bc.json${NC}"
else
    echo "✓ coco-gpt-tm30-225b147529bc.json already removed"
fi

# Remove log files
if ls *.log 1> /dev/null 2>&1; then
    rm *.log
    echo -e "${GREEN}✓ Deleted log files${NC}"
else
    echo "✓ No log files to remove"
fi

# Remove .DS_Store
if [ -f ".DS_Store" ]; then
    rm .DS_Store
    echo -e "${GREEN}✓ Deleted .DS_Store${NC}"
else
    echo "✓ .DS_Store already removed"
fi

echo ""
echo -e "${YELLOW}Step 2: Removing files from git history${NC}"
echo "----------------------------------------"
echo "This will remove sensitive files from ALL commits in history..."
echo ""

# Remove files from git history using filter-repo (recommended) or filter-branch (fallback)
if command -v git-filter-repo &> /dev/null; then
    echo "Using git-filter-repo (recommended method)..."
    git filter-repo --invert-paths \
        --path coco-gpt-tm30-225b147529bc.json \
        --path '*.log' \
        --path .DS_Store \
        --force
    echo -e "${GREEN}✓ Files removed from history using git-filter-repo${NC}"
else
    echo "git-filter-repo not found, using filter-branch (slower)..."
    
    # Remove credentials JSON
    git filter-branch --force --index-filter \
        'git rm --cached --ignore-unmatch coco-gpt-tm30-225b147529bc.json' \
        --prune-empty --tag-name-filter cat -- --all
    
    # Remove log files
    git filter-branch --force --index-filter \
        'git rm --cached --ignore-unmatch *.log' \
        --prune-empty --tag-name-filter cat -- --all
    
    # Remove .DS_Store
    git filter-branch --force --index-filter \
        'git rm --cached --ignore-unmatch .DS_Store' \
        --prune-empty --tag-name-filter cat -- --all
    
    echo -e "${GREEN}✓ Files removed from history using filter-branch${NC}"
fi

echo ""
echo -e "${YELLOW}Step 3: Adding cleaned files${NC}"
echo "----------------------------"

# Add all files (respecting .gitignore)
git add .

# Show what will be committed
echo ""
echo "Files to be committed:"
git status --short

echo ""
echo -e "${RED}VERIFY: Make sure NO .json, .log, or .env files appear above!${NC}"
echo ""
read -p "Does everything look correct? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo -e "${RED}Aborting. Please review and run again.${NC}"
    exit 1
fi

# Commit the changes
git commit -m "Security: Remove sensitive files and add .gitignore

- Removed Google Cloud credentials JSON
- Removed log files with transaction data
- Removed .DS_Store
- Added .gitignore to prevent future commits
- Added .env.example template
- Cleaned process_bbl_slips.ts (removed hardcoded credentials)
- Updated documentation"

echo -e "${GREEN}✓ Changes committed${NC}"

echo ""
echo -e "${YELLOW}Step 4: Force pushing to GitHub${NC}"
echo "--------------------------------"
echo ""
echo -e "${RED}WARNING: This will OVERWRITE the remote repository!${NC}"
echo "This is necessary to remove sensitive files from the history."
echo ""
read -p "Push to GitHub? (yes/no): " push_confirm

if [ "$push_confirm" != "yes" ]; then
    echo -e "${YELLOW}Skipping push. You can manually push later with:${NC}"
    echo "git push --force origin main"
    exit 0
fi

# Add remote if not already added
if ! git remote | grep -q origin; then
    echo ""
    echo "No remote 'origin' found."
    read -p "Enter your GitHub repository URL: " repo_url
    git remote add origin "$repo_url"
    echo -e "${GREEN}✓ Added remote origin${NC}"
fi

# Get the remote URL
remote_url=$(git remote get-url origin)
echo "Pushing to: $remote_url"

# Force push to overwrite history
git push --force origin main

echo ""
echo -e "${GREEN}✅ SUCCESS! Repository cleaned and pushed to GitHub${NC}"
echo ""
echo "Next steps:"
echo "1. Verify on GitHub that sensitive files are gone"
echo "2. Check that .gitignore and .env.example are present"
echo "3. Rotate your credentials as a precaution:"
echo "   - Generate new Google Cloud service account key"
echo "   - Reset Supabase keys (if they were in any commits)"
echo ""
echo "Your repository is now safe! 🎉"
