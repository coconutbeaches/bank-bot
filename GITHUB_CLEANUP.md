# Manual GitHub Cleanup Guide

## Situation
You've already pushed the repository to GitHub (coconutbeachesbank-bot) as a private repo, but it contains sensitive files in the git history.

## Goal
Remove sensitive files from git history and push the cleaned version to GitHub.

## Option 1: Automated Script (Recommended)

```bash
cd /Users/tyler/Projects/bank-bot
chmod +x cleanup_github.sh
./cleanup_github.sh
```

The script will:
1. Delete sensitive files locally
2. Remove them from git history
3. Commit the cleaned files
4. Force push to GitHub

## Option 2: Manual Steps

If you prefer to do it manually, follow these steps:

### Step 1: Delete Sensitive Files Locally

```bash
cd /Users/tyler/Projects/bank-bot

# Delete credentials
rm coco-gpt-tm30-225b147529bc.json

# Delete logs
rm *.log

# Delete .DS_Store
rm .DS_Store
```

### Step 2: Remove Files from Git History

**Method A: Using git-filter-repo (fastest, cleanest)**

First install git-filter-repo:
```bash
brew install git-filter-repo
```

Then run:
```bash
cd /Users/tyler/Projects/bank-bot

git filter-repo --invert-paths \
  --path coco-gpt-tm30-225b147529bc.json \
  --path '*.log' \
  --path .DS_Store \
  --force
```

**Method B: Using filter-branch (if git-filter-repo not available)**

```bash
cd /Users/tyler/Projects/bank-bot

# Remove credentials
git filter-branch --force --index-filter \
  'git rm --cached --ignore-unmatch coco-gpt-tm30-225b147529bc.json' \
  --prune-empty --tag-name-filter cat -- --all

# Remove logs
git filter-branch --force --index-filter \
  'git rm --cached --ignore-unmatch *.log' \
  --prune-empty --tag-name-filter cat -- --all

# Remove .DS_Store
git filter-branch --force --index-filter \
  'git rm --cached --ignore-unmatch .DS_Store' \
  --prune-empty --tag-name-filter cat -- --all
```

### Step 3: Add All Cleaned Files

```bash
# Add everything (respecting .gitignore)
git add .

# Verify what will be committed
git status
```

**🔴 CRITICAL CHECK:**
Make sure you see:
- ✅ `.gitignore`
- ✅ `.env.example`
- ✅ All `.ts` files
- ✅ All `.md` files
- ❌ NO `.json` files (except maybe package.json if you have one)
- ❌ NO `.log` files
- ❌ NO `.env` files
- ❌ NO `.DS_Store`

### Step 4: Commit Changes

```bash
git commit -m "Security: Remove sensitive files and add .gitignore

- Removed Google Cloud credentials JSON
- Removed log files with transaction data  
- Removed .DS_Store
- Added .gitignore to prevent future commits
- Added .env.example template
- Cleaned process_bbl_slips.ts (removed hardcoded credentials)
- Updated documentation"
```

### Step 5: Re-add Remote (if needed after filter-repo)

If you used `git-filter-repo`, you need to re-add the remote:

```bash
git remote add origin https://github.com/coconutbeaches/bank-bot.git
```

If the remote already exists, you're good to go.

### Step 6: Force Push to GitHub

⚠️ **WARNING:** This will overwrite the remote repository!

```bash
git push --force origin main
```

If you get an error about the branch name, try:
```bash
git push --force origin master
```

### Step 7: Verify on GitHub

1. Go to https://github.com/coconutbeaches/bank-bot
2. Check that these files are present:
   - ✅ `.gitignore`
   - ✅ `.env.example`
   - ✅ `README.md` (updated version)
   - ✅ `SETUP.md`
   - ✅ All `.ts` files

3. Check that these files are NOT present:
   - ❌ `coco-gpt-tm30-225b147529bc.json`
   - ❌ Any `.log` files
   - ❌ `.DS_Store`

4. Click on "X commits" to view history
5. Browse through a few commits to verify sensitive files aren't in old commits

### Step 8: Rotate Credentials (Recommended)

Even though it's a private repo, it's good practice to rotate:

**Google Cloud:**
1. Go to Google Cloud Console
2. Find your service account
3. Delete the old key
4. Create a new key
5. Download the new JSON file
6. Update your local `.env` file

**Supabase:**
1. Go to Supabase project settings
2. API settings
3. Click "Reset" on service role key (if it was exposed)
4. Update your local `.env` file

## Troubleshooting

### "remote origin already exists"
```bash
git remote remove origin
git remote add origin https://github.com/coconutbeaches/bank-bot.git
```

### "failed to push some refs"
You need to force push:
```bash
git push --force origin main
```

### "src refspec main does not match any"
Try master instead:
```bash
git push --force origin master
```

Or create and push main:
```bash
git checkout -b main
git push --force origin main
```

### Still seeing sensitive files on GitHub after push

1. Clear your browser cache
2. Try incognito/private browsing mode
3. Wait a few minutes and refresh

If they're still there, the force push didn't work. Try again.

## Verification Checklist

After completing all steps:

- [ ] Local directory has no `.json` credentials file
- [ ] Local directory has no `.log` files
- [ ] `.gitignore` exists and is committed
- [ ] `.env.example` exists and is committed
- [ ] `git status` shows clean working tree
- [ ] GitHub shows no sensitive files in current code
- [ ] GitHub history shows no sensitive files in recent commits
- [ ] Credentials have been rotated (recommended)

## Success!

Your repository is now clean and secure! 🎉

The sensitive files have been:
- ✅ Removed from your local directory
- ✅ Removed from git history
- ✅ Removed from GitHub
- ✅ Blocked from future commits by `.gitignore`
