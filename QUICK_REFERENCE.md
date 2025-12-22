# Quick Reference - GitHub Upload

## ✅ What Was Done

1. **Created `.gitignore`** - Blocks all sensitive files
2. **Created `.env.example`** - Template for credentials
3. **Cleaned `process_bbl_slips.ts`** - Removed hardcoded credentials
4. **Updated `README.md`** - Removed specific URLs
5. **Created `SETUP.md`** - Detailed setup guide
6. **Created `SECURITY_CLEANUP.md`** - Complete security audit

## 🔴 CRITICAL: Before First Commit

**You MUST delete this file:**
```bash
rm /Users/tyler/Projects/bank-bot/coco-gpt-tm30-225b147529bc.json
```

Or ensure it's in a directory that's gitignored.

## 📋 Upload Checklist

```bash
# 1. Navigate to project
cd /Users/tyler/Projects/bank-bot

# 2. Delete the credentials file (CRITICAL!)
rm coco-gpt-tm30-225b147529bc.json

# 3. Initialize git (if not already)
git init

# 4. Add all safe files
git add .

# 5. Check what will be committed
git status
# VERIFY: No .json, .log, or .env files should appear

# 6. Commit
git commit -m "Initial commit: Bangkok Bank OCR processor"

# 7. Add remote (replace with your repo URL)
git remote add origin https://github.com/yourusername/bank-bot.git

# 8. Push
git push -u origin main
```

## ⚠️ Safety Check

Before pushing, verify these files are NOT showing in `git status`:
- ❌ `coco-gpt-tm30-225b147529bc.json`
- ❌ Any `.env` files (except `.env.example`)
- ❌ Any `.log` files
- ❌ `.DS_Store`

## ✅ Files That SHOULD Be Committed

- ✅ All `.ts` files (now cleaned)
- ✅ All `.sql` files
- ✅ All `.md` files
- ✅ All `.html` files
- ✅ `.gitignore`
- ✅ `.env.example`

## 🔐 Security Notes

**Your credentials are safe because:**
1. `.gitignore` blocks all `.json` files
2. `.gitignore` blocks `.env` files
3. All hardcoded credentials removed from code
4. Only `.env.example` (with placeholders) is committed

**If you ever need to share credentials:**
- Use environment variables
- Share `.env.example` and tell people to create their own `.env`
- Never email or slack actual credentials

## 📚 For Collaborators

Send them:
1. Link to GitHub repo
2. Tell them to read `SETUP.md`
3. They create their own `.env` from `.env.example`
4. They get their own Google Cloud credentials

## 🆘 Emergency - Accidentally Committed Credentials

If you push and realize credentials were included:

```bash
# 1. IMMEDIATELY rotate all keys in Google Cloud and Supabase

# 2. Remove from git history
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch *.json" \
  --prune-empty -- --all

# 3. Force push
git push origin --force --all

# 4. Verify on GitHub the file is gone
```

## 🎯 Ready to Upload?

Run this final verification:
```bash
cd /Users/tyler/Projects/bank-bot
ls -la coco-gpt-tm30-225b147529bc.json
# Should show "No such file or directory"

git status
# Should NOT show any .json, .log, or .env files
```

If both checks pass, you're safe to push! 🚀
