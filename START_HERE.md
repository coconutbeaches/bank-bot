# 🚨 URGENT: GitHub Repository Cleanup

## Current Situation

You've uploaded your `bank-bot` repository to GitHub (coconutbeachesbank-bot) as a private repo, but it contains sensitive files including:
- ❌ Google Cloud credentials (`coco-gpt-tm30-225b147529bc.json`)
- ❌ Hardcoded Supabase keys in code
- ❌ Log files with transaction data
- ❌ .DS_Store files

**Even though it's private, these should be removed from git history.**

## What We've Done

✅ Created `.gitignore` to block future commits
✅ Created `.env.example` as a template
✅ Cleaned `process_bbl_slips.ts` (removed hardcoded credentials)
✅ Updated `README.md` (removed specific URLs)
✅ Created setup documentation

## What You Need to Do Now

### Quick Start (Recommended)

```bash
# 1. Navigate to the project
cd /Users/tyler/Projects/bank-bot

# 2. Check current status
chmod +x check_repo.sh
./check_repo.sh

# 3. Run the cleanup script
chmod +x cleanup_github.sh
./cleanup_github.sh
```

The automated script will:
1. ✅ Delete sensitive files locally
2. ✅ Remove them from git history
3. ✅ Commit cleaned files
4. ✅ Force push to GitHub (with your confirmation)

### Manual Alternative

If you prefer manual control, see `GITHUB_CLEANUP.md` for step-by-step instructions.

## Before Running Cleanup

Make sure you have your credentials saved elsewhere:
1. Copy `coco-gpt-tm30-225b147529bc.json` to a secure location
2. Note your Supabase URL and keys
3. You'll set these up in `.env` after cleanup

## After Cleanup

1. **Verify on GitHub:**
   - Visit https://github.com/coconutbeaches/bank-bot
   - Check files are gone from current view
   - Browse commit history to verify removal

2. **Set up local environment:**
   ```bash
   # Copy your credentials to secure location (outside repo)
   mkdir -p ~/credentials
   mv /path/to/backup/coco-gpt-tm30-225b147529bc.json ~/credentials/
   
   # Create .env from template
   cp .env.example .env
   nano .env  # Fill in your actual credentials
   ```

3. **Rotate credentials (recommended):**
   - Generate new Google Cloud service account key
   - Consider resetting Supabase keys if they were exposed

## Verification Checklist

After running cleanup:

- [ ] Ran `check_repo.sh` - all checks pass
- [ ] Pushed to GitHub successfully
- [ ] Verified on GitHub website - no sensitive files visible
- [ ] Created local `.env` with credentials
- [ ] Moved credentials JSON to secure location outside repo
- [ ] Tested that app still works with new setup

## Files Overview

**Use These:**
- `cleanup_github.sh` - Automated cleanup and push
- `check_repo.sh` - Verify repo is clean
- `GITHUB_CLEANUP.md` - Manual step-by-step guide

**Read These:**
- `SETUP.md` - How to set up the project after cleanup
- `SECURITY_CLEANUP.md` - What was changed and why
- `QUICK_REFERENCE.md` - Quick commands reference

## Common Issues

### "Permission denied" when running scripts
```bash
chmod +x cleanup_github.sh check_repo.sh
```

### "remote origin already exists" error
The script will handle this, or manually:
```bash
git remote remove origin
git remote add origin https://github.com/coconutbeaches/bank-bot.git
```

### Changes not showing on GitHub
- Clear browser cache or use incognito mode
- Wait a few minutes and refresh
- Check you pushed to the correct branch (main vs master)

## Timeline

**Total time needed:** ~10 minutes

1. Run `check_repo.sh` - 30 seconds
2. Run `cleanup_github.sh` - 3-5 minutes (depending on repo size)
3. Verify on GitHub - 2 minutes
4. Set up local `.env` - 2 minutes
5. Test app still works - 2 minutes

## Why This Matters

Even in a private repo:
- ✅ Best practice to keep credentials out of git
- ✅ Prevents accidental exposure if repo becomes public
- ✅ Protects against GitHub account compromise
- ✅ Shows good security hygiene to collaborators
- ✅ Makes credential rotation easier

## Need Help?

If you encounter any issues:
1. Check `GITHUB_CLEANUP.md` for troubleshooting
2. Run `check_repo.sh` to see what's wrong
3. The scripts are well-commented if you want to see what they do

## Ready?

When you're ready to clean up the repository:

```bash
cd /Users/tyler/Projects/bank-bot
./check_repo.sh
./cleanup_github.sh
```

That's it! 🚀
