#!/bin/bash

# Repository Status Checker
# Quick verification that sensitive files are not in the repo

echo "🔍 Checking Repository Status"
echo "=============================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check if we're in a git repo
if [ ! -d ".git" ]; then
    echo -e "${RED}Error: Not a git repository${NC}"
    exit 1
fi

echo "📁 Checking local directory..."
echo "------------------------------"

# Check for sensitive files locally
issues=0

if [ -f "coco-gpt-tm30-225b147529bc.json" ]; then
    echo -e "${RED}❌ Found: coco-gpt-tm30-225b147529bc.json${NC}"
    issues=$((issues + 1))
else
    echo -e "${GREEN}✓ No credentials JSON file${NC}"
fi

if ls *.log 1> /dev/null 2>&1; then
    echo -e "${RED}❌ Found: .log files${NC}"
    ls *.log
    issues=$((issues + 1))
else
    echo -e "${GREEN}✓ No log files${NC}"
fi

if [ -f ".DS_Store" ]; then
    echo -e "${RED}❌ Found: .DS_Store${NC}"
    issues=$((issues + 1))
else
    echo -e "${GREEN}✓ No .DS_Store${NC}"
fi

if [ -f ".env" ]; then
    echo -e "${YELLOW}⚠ Found: .env (should not be committed)${NC}"
    echo "  This is OK if it's in .gitignore"
fi

echo ""
echo "📋 Checking git status..."
echo "-------------------------"

# Check what's staged/tracked
staged=$(git status --short | grep -E '\.json$|\.log$|\.DS_Store$|^\.env$' || true)

if [ -z "$staged" ]; then
    echo -e "${GREEN}✓ No sensitive files staged for commit${NC}"
else
    echo -e "${RED}❌ Sensitive files staged:${NC}"
    echo "$staged"
    issues=$((issues + 1))
fi

echo ""
echo "🔍 Checking .gitignore..."
echo "-------------------------"

if [ -f ".gitignore" ]; then
    echo -e "${GREEN}✓ .gitignore exists${NC}"
    
    # Check if it contains necessary patterns
    if grep -q "\.json" .gitignore; then
        echo -e "${GREEN}  ✓ Blocks .json files${NC}"
    else
        echo -e "${RED}  ❌ Missing .json pattern${NC}"
        issues=$((issues + 1))
    fi
    
    if grep -q "\.log" .gitignore; then
        echo -e "${GREEN}  ✓ Blocks .log files${NC}"
    else
        echo -e "${RED}  ❌ Missing .log pattern${NC}"
        issues=$((issues + 1))
    fi
    
    if grep -q "\.env" .gitignore; then
        echo -e "${GREEN}  ✓ Blocks .env files${NC}"
    else
        echo -e "${RED}  ❌ Missing .env pattern${NC}"
        issues=$((issues + 1))
    fi
else
    echo -e "${RED}❌ .gitignore missing!${NC}"
    issues=$((issues + 1))
fi

echo ""
echo "📝 Checking required files..."
echo "-----------------------------"

if [ -f ".env.example" ]; then
    echo -e "${GREEN}✓ .env.example exists${NC}"
else
    echo -e "${RED}❌ .env.example missing${NC}"
    issues=$((issues + 1))
fi

if [ -f "README.md" ]; then
    # Check if README has been updated (doesn't contain hardcoded URL)
    if grep -q "wcplwmvbhreevxvsdmog" README.md; then
        echo -e "${RED}❌ README.md contains hardcoded Supabase URL${NC}"
        issues=$((issues + 1))
    else
        echo -e "${GREEN}✓ README.md looks clean${NC}"
    fi
else
    echo -e "${YELLOW}⚠ README.md missing${NC}"
fi

echo ""
echo "🔎 Checking recent git history..."
echo "---------------------------------"

# Check last 5 commits for sensitive files
sensitive_in_history=$(git log --all --name-only --pretty=format: -5 | grep -E '\.json$|\.log$|\.DS_Store$' | sort -u || true)

if [ -z "$sensitive_in_history" ]; then
    echo -e "${GREEN}✓ No sensitive files in last 5 commits${NC}"
else
    echo -e "${RED}❌ Sensitive files found in recent history:${NC}"
    echo "$sensitive_in_history"
    echo ""
    echo -e "${YELLOW}  Run cleanup_github.sh to remove from history${NC}"
    issues=$((issues + 1))
fi

echo ""
echo "================================"

if [ $issues -eq 0 ]; then
    echo -e "${GREEN}✅ All checks passed! Repository is clean.${NC}"
    echo ""
    echo "Safe to push to GitHub!"
    exit 0
else
    echo -e "${RED}⚠️  Found $issues issue(s) that need attention.${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Fix the issues listed above"
    echo "2. Run ./cleanup_github.sh to clean and push"
    echo "3. Or follow GITHUB_CLEANUP.md for manual steps"
    exit 1
fi
