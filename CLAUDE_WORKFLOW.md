# Claude Code Workflow Documentation

## GitHub CLI Setup

Each session requires installing and configuring GitHub CLI:

```bash
# Fix apt source (shell expansion doesn't work in sources.list)
echo "deb [arch=amd64 signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list

# Install gh CLI
apt-get update -qq && apt-get install -y gh
```

## Git Configuration

- Remote uses local proxy: `http://local_proxy@127.0.0.1:39333/git/FullStackKevinVanDriel/space-scene`
- All branches must start with `claude/` and end with session ID (e.g., `-2aTC2`)
- Cannot push directly to `main` branch

## PR and Merge Workflow

1. **Make changes** on a `claude/*-2aTC2` branch
2. **Commit and push** the branch
3. **Create PR** using: `gh pr create --title "Title" --body "Description" --base main`
4. **Auto-merge workflow** runs automatically when PR is created
   - Workflow: `.github/workflows/auto-merge-claude.yml`
   - Merges without requiring approval (MERGE_REQUIRED_APPROVALS: 0)
   - Uses squash merge method
5. **Vercel deploys** automatically after merge to main

## Common Issues

### gh CLI not installed
- Install using commands above
- Verify with: `gh --version`

### Auto-merge failing with "GitHub Actions is not permitted to approve pull requests"
- Remove the auto-approve step from workflow
- Ensure `MERGE_REQUIRED_APPROVALS: 0` is set

### Can't push to main
- Create a `claude/*-2aTC2` branch instead
- Push branch, then create PR

## Current Session ID
- `2aTC2`

## Example Commands

```bash
# Create and push a branch
git checkout -b claude/my-feature-2aTC2
git add .
git commit -m "Add feature"
git push -u origin claude/my-feature-2aTC2

# Create PR
gh pr create --title "Add feature" --body "Description of changes" --base main

# Check PR status
gh pr list

# View PR
gh pr view
```
