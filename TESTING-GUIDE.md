# Testing Guide - Unity Auto-Grader

## Quick Start for Testing

### Use the Debug Batch File (RECOMMENDED)

```bash
start-debug.bat
```

This enables:
- ✅ DevTools opened automatically
- ✅ Verbose console logging
- ✅ Detailed grading progress
- ✅ Error stack traces
- ✅ LLM API call logging

## What You'll See in the Console

### During Batch Grading

```
=== BATCH GRADING START ===
Criteria ID: default-unity-math
Instructions: Grade thoroughly
Use Claude Code: false
Current Assignment: {...}
📊 Starting batch grading for 5 submissions

--- Processing Submission 1/5 ---
Student: John Doe
User ID: 12345
✅ Found GitHub URL (github_url): https://github.com/student/project
📥 Starting analysis for: https://github.com/student/project
Assignment Context: {...}
Criteria: {...}

========================================
🎓 GRADING REQUEST RECEIVED
========================================
Repository: https://github.com/student/project
Has Criteria: true
Has Assignment Details: true
Timestamp: 2025-01-01T12:00:00.000Z
========================================

✅ Data serialization successful
📂 Step 1/3: Cloning and analyzing Unity project...
✅ Unity project analysis complete
   - Files found: 8
   - Valid Unity project: true
🤖 Step 2/3: Initializing LLM integration...
✅ LLM initialized successfully
   Provider: anthropic
📝 Step 3/3: Sending to LLM for grading...
✅ LLM grading complete
   Overall grade: 42.5
   Duration: 15.3s

========================================
✅ GRADING COMPLETE
========================================

✅ Analysis completed in 15.30s
Result: {...}
Grade extracted: {...}
```

### Common Log Messages

#### Success Messages
- `✅` - Step completed successfully
- `📁 Using Canvas API URL from .env file` - Loaded Canvas from .env
- `📁 Using Canvas API token from .env file` - Loaded Canvas token from .env
- `✅ Canvas credentials loaded successfully` - Canvas auth restored

#### Warning Messages
- `⚠️  No GitHub URL found in attachments` - Submission has no repo link
- `⏭️  Skipping submission X - no GitHub URL` - Moving to next student

#### Error Messages
- `❌ No GitHub URL found for this submission` - Can't grade without repo
- `❌ Analysis failed:` - Unity project analysis error
- `❌ Error grading:` - General grading error
- `❌ LLM not available` - No LLM API key configured

## Debugging Common Issues

### Issue: No Canvas credentials

**Look for:**
```
ℹ️  No stored Canvas credentials found
```

**Fix:**
1. Add to `.env`:
   ```
   CANVAS_API_URL=https://your-school.instructure.com/api/v1
   CANVAS_API_KEY=your_token_here
   ```
2. OR enter credentials in Canvas Setup panel

### Issue: LLM not available

**Look for:**
```
❌ LLM not available
⚠️  No active LLM provider found
```

**Fix:**
1. Go to Settings panel
2. Add API key for OpenAI, Anthropic, or another provider
3. Mark it as "Active"

### Issue: GitHub URL not found

**Look for:**
```
❌ No GitHub URL found for this submission
⏭️  Skipping submission X - no GitHub URL
```

**Fix:**
- Students need to submit GitHub URL in Canvas
- Check if URL is in submission text or attachments
- Verify URL format: `https://github.com/user/repo`

### Issue: Unity project not valid

**Look for:**
```
✅ Unity project analysis complete
   - Files found: 0
   - Valid Unity project: false
```

**Fix:**
- Repository must have `Assets` and `ProjectSettings` folders
- Check if students pushed the correct folder structure
- Verify .gitignore isn't excluding Unity folders

## Console Commands for Testing

### Check Environment Variables
```bash
node test-env.js
```

Shows:
- Canvas credentials status
- LLM API keys status
- GitHub token status

### Check Stored Config
Open in Notepad:
```bash
notepad "C:\Users\v-2jo\AppData\Roaming\unity-auto-grader-desktop\config.json"
```

### Clear All Stored Data (Reset)
```bash
rmdir /s /q "C:\Users\v-2jo\AppData\Roaming\unity-auto-grader-desktop"
```

## Grading Process Timeline

Typical timing for one submission:

1. **GitHub Clone**: 3-10 seconds
2. **Unity Analysis**: 2-5 seconds
3. **LLM Grading**: 10-30 seconds
4. **Cleanup**: 1-2 seconds

**Total per submission**: ~20-50 seconds

For 10 submissions: ~5-10 minutes

## What to Monitor

### In DevTools Console (F12)

1. **Frontend Logs** (Blue text):
   - Submission processing
   - GitHub URL extraction
   - Progress updates
   - Result handling

2. **Backend Logs** (White text):
   - Grading requests received
   - Unity project analysis
   - LLM API calls
   - Error details

### In Terminal/CMD

- Electron main process logs
- Git clone operations
- File system operations
- Network requests

## Interpreting Results

### Success
```javascript
Result: {
  success: true,
  analysis: { /* Unity project data */ },
  grade: {
    overallGrade: 42.5,
    maxPoints: 50,
    criteriaScores: { /* breakdown */ },
    overallFeedback: { /* feedback */ }
  }
}
```

### Failure
```javascript
Result: {
  success: false,
  error: "Repository not found",
  grade: {
    overallGrade: 0,
    feedback: "Failed to analyze project: Repository not found"
  }
}
```

## Performance Monitoring

### Check LLM Response Time
Look for:
```
Duration: 15.3s
```

- Fast (5-15s): Normal
- Medium (15-30s): Acceptable
- Slow (>30s): Check API rate limits or network

### Check Unity Analysis Time
Look for:
```
✅ Analysis completed in 5.20s
```

- Fast (<5s): Small project
- Medium (5-15s): Normal project
- Slow (>15s): Large project or slow disk

## Common Error Patterns

### Pattern 1: All submissions skipped
```
⏭️  Skipping submission 1 - no GitHub URL
⏭️  Skipping submission 2 - no GitHub URL
```
**Cause**: Submissions don't have GitHub URLs
**Fix**: Check Canvas submission format

### Pattern 2: Analysis succeeds, grading fails
```
✅ Unity project analysis complete
❌ LLM grading complete
   Overall grade: N/A
```
**Cause**: LLM API error or invalid response
**Fix**: Check LLM API key, quota, and network

### Pattern 3: Random failures
```
❌ Error grading: timeout
❌ Error grading: ECONNRESET
```
**Cause**: Network issues or rate limiting
**Fix**: Add delays between requests, check network stability

## Tips for Effective Testing

1. **Start with ONE submission** - Test individual grading first
2. **Check each log section** - Verify each step completes
3. **Note timing** - Identify slow operations
4. **Save error messages** - Copy full error text for debugging
5. **Test with different repos** - Try various Unity project structures

## Need More Help?

1. Check `BUGFIXES.md` for known issues and solutions
2. Review `README.md` for setup instructions
3. Check DevTools Network tab for API call failures
4. Look at electron main process logs in terminal

---

**Happy Testing!** 🎓✨
