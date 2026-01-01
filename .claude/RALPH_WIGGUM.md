# Ralph Wiggum Loop - Quick Reference

Ralph Wiggum is now installed and ready to use! This plugin enables autonomous iterative development where Claude continuously improves its work across multiple iterations.

## How It Works

Ralph creates a feedback loop:
1. You give Claude a task with `/ralph-loop "your task"`
2. Claude works on it and tries to exit
3. The stop hook intercepts and feeds the same prompt back
4. Claude sees its previous work (files, git history) and iterates
5. Loop continues until completion promise is met or max iterations reached

## Commands

### Start a Loop
```bash
/ralph-loop "Implement feature X with tests" --max-iterations 10 --completion-promise "All tests pass"
```

**Parameters:**
- `PROMPT` - The task description (required)
- `--max-iterations N` - Maximum loop iterations (default: infinite)
- `--completion-promise "TEXT"` - Exact text to output when done

### Cancel a Loop
```bash
/cancel-ralph
```

Stops the current Ralph loop immediately.

## Best Practices

### ✅ Good Use Cases
- **Test-driven development**: "Implement X until all tests pass"
- **Bug fixing**: "Fix the issue in module Y"
- **Refactoring**: "Refactor codebase to use pattern Z"
- **Greenfield projects**: "Build feature X from scratch with full test coverage"

### ❌ Avoid For
- Ambiguous tasks without clear completion criteria
- Tasks requiring human judgment or creativity
- Exploratory work without defined goals

### Writing Good Prompts

**Bad:**
```bash
/ralph-loop "Make the code better"
```
Too vague, no clear completion criteria.

**Good:**
```bash
/ralph-loop "Refactor authentication module" --completion-promise "All auth tests pass and coverage is >90%" --max-iterations 15
```
Clear goal, measurable completion, safety limit.

## Completion Promises

The completion promise is a STRICT contract:
- Claude **MUST NOT** output false promises to exit
- The `<promise>` tag is ONLY output when genuinely true
- This prevents premature exits and ensures quality

Example:
```bash
/ralph-loop "Add user login" --completion-promise "Login works and tests pass"
```

Claude will only output `<promise>Login works and tests pass</promise>` when it's actually true.

## Safety Features

### Iteration Limits
Always set `--max-iterations` for safety:
```bash
/ralph-loop "Complex task" --max-iterations 20
```

### State Tracking
Loop state is stored in `.claude/ralph-loop.local.md` (gitignored).

### Transparent Operation
Each iteration shows:
- Current iteration number
- Remaining iterations
- Completion promise (if set)

## Example Workflows

### Test-Driven Feature Development
```bash
/ralph-loop "Implement user registration with email verification" \
  --completion-promise "All tests pass and coverage >85%" \
  --max-iterations 15
```

### Bug Hunt
```bash
/ralph-loop "Fix the race condition in async data loading" \
  --completion-promise "Bug is fixed and verified with new test" \
  --max-iterations 10
```

### Comprehensive Refactoring
```bash
/ralph-loop "Migrate from callbacks to async/await throughout codebase" \
  --completion-promise "All code uses async/await, tests pass, no regressions" \
  --max-iterations 25
```

## Monitoring Progress

Ralph shows iteration count in system messages:
```
[Iteration 3/10]
Task: "Implement user auth"
Completion promise: "All auth tests pass"
```

Watch for:
- Incremental progress in git history
- Test results improving
- Coverage increasing

## Troubleshooting

### Loop Won't Complete
- Check if completion promise is achievable
- Verify tests are actually runnable
- Ensure criteria are clear and measurable

### Loop Exits Too Early
- Make completion promise more specific
- Remove ambiguous criteria
- Add measurable metrics

### Hitting Max Iterations
- Increase `--max-iterations`
- Break task into smaller pieces
- Simplify completion criteria

## Advanced Usage

### Infinite Loop (Use Carefully!)
```bash
/ralph-loop "Continuously improve test coverage" --max-iterations 0
```

Only use with VERY clear completion promises!

### Phased Development
```bash
# Phase 1
/ralph-loop "Implement core feature" --completion-promise "Core works with tests"

# Then Phase 2
/ralph-loop "Add error handling" --completion-promise "All edge cases handled"
```

## Files

- **Commands**: `~/.claude/commands/ralph-loop.md`, `~/.claude/commands/cancel-ralph.md`
- **Scripts**: `~/.claude/scripts/setup-ralph-loop.sh`
- **Hooks**: `~/.claude/hooks/ralph-stop-hook.sh`
- **State**: `.claude/ralph-loop.local.md` (created when loop is active)

## Tips

1. **Start small** - Test with simple tasks first
2. **Be specific** - Clear prompts = better results
3. **Set limits** - Always use `--max-iterations` for safety
4. **Trust the process** - Don't prematurely cancel loops
5. **Review history** - Check git log to see iteration progress

---

**Note**: Ralph is based on the official Anthropic Claude Plugins repository. This is a powerful tool - use it responsibly!
