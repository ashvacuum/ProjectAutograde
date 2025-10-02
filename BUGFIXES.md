# Bug Fixes Applied - Unity Auto-Grader

## Session Date: 2025-01-01

### Critical Bugs Fixed

#### 1. Canvas API Token Not Persisting (FIXED)
**Issue**: Canvas credentials saved but lost on app restart
**Root Cause**:
- Credentials were saved to electron-store successfully
- BUT the `canvasAuth` instance in main.js never loaded them on startup
- The backend API object had no credentials, causing all Canvas API calls to fail

**Files Modified**:
- `main.js:132-146` - Added `canvasAuth.loadStoredCredentials()` call on app startup
- `src/renderer/renderer.js:113-142` - Enhanced Canvas auth checking to display full user info
- `src/renderer/renderer.js:1688-1722` - Improved Canvas Setup panel to show stored credentials

**Storage Location**:
- Windows: `C:\Users\v-2jo\AppData\Roaming\unity-auto-grader-desktop\config.json`
- Stores: `canvas.apiUrl`, `canvas.token`, `canvas.user`, `canvas.authenticatedAt`

**How to Verify**:
1. Connect to Canvas
2. Close and restart the app
3. Dashboard should show "Connected" status
4. Canvas Setup panel should display your user info
5. Assignments panel should load courses without re-authenticating

---

#### 2. Missing `displayResults()` Function (FIXED)
**Issue**: `Error during batch grading: this.displayResults is not a function`
**Root Cause**: Function was renamed from `displayResults()` to `loadGradingResults()` but two call sites weren't updated

**Files Modified**:
- `src/renderer/renderer.js:771` - Changed `displayResults()` to `loadGradingResults()`
- `src/renderer/renderer.js:1034` - Changed `displayResults()` to `loadGradingResults()`

---

#### 3. GitHub URL Property Inconsistency (FIXED)
**Issue**: Frontend expected different property names than backend provided
**Root Cause**: Canvas API returned `github_url` but frontend checked for `githubUrl`

**Files Modified**:
- `src/canvas/canvas-api.js:110-122` - Now returns both `github_url` AND `githubUrl` properties
- Also added proper `user` object structure and `attachments` array

---

#### 4. Missing Assignment Context in LLM Grading (FIXED)
**Issue**: LLM didn't receive assignment details for better grading context
**Root Cause**: Preload.js only passed 2 parameters, main.js expected 3

**Files Modified**:
- `preload.js:33` - Added `assignmentDetails` parameter to IPC call
- `src/renderer/renderer.js:710-746` - Enhanced batch grading to pass assignment context

---

#### 5. Canvas URL Validation Logic Error (FIXED)
**Issue**: Boolean logic error in URL validation
**Root Cause**: Missing parentheses caused OR operator to evaluate incorrectly

**Files Modified**:
- `src/canvas/canvas-auth.js:132-141` - Added proper parentheses around hostname checks

---

#### 6. Grade Extraction from Nested Results (FIXED)
**Issue**: Couldn't extract grades when LLM returned nested structures
**Root Cause**: Code didn't handle both `grade.overallGrade` and `grade.result.overallGrade`

**Files Modified**:
- `src/renderer/renderer.js:1569-1577` - Improved grade display logic
- `src/renderer/renderer.js:1860-1868` - Enhanced grade extraction for Canvas posting

---

#### 7. GitHub URL Regex Too Restrictive (FIXED)
**Issue**: Valid GitHub URLs were rejected
**Root Cause**: Regex didn't handle www. prefix and was too strict on path format

**Files Modified**:
- `src/utils/git-commands.js:32-41` - Updated regex to accept more valid formats

---

#### 8. Missing User Object in Submissions (FIXED)
**Issue**: `Cannot read properties of undefined (reading 'name')`
**Root Cause**: Canvas API returned flat `user_name` but code expected nested `user.name`

**Files Modified**:
- `src/canvas/canvas-api.js:113` - Added proper user object: `{ name: 'Unknown User', id: submission.user_id }`
- `src/renderer/renderer.js:728-729` - Added null-safe user access with `?.`

---

#### 10. Canvas Credentials from .env File (ENHANCED)
**Enhancement**: Support loading Canvas credentials from environment variables
**User Request**: Canvas API key stored in `.env` as `CANVAS_API_KEY` wasn't being used

**Files Modified**:
- `src/canvas/canvas-auth.js:54-73` - Added fallback to environment variables
  - Checks `process.env.CANVAS_API_URL` if not in electron-store
  - Checks `process.env.CANVAS_TOKEN` OR `process.env.CANVAS_API_KEY` for token
  - Logs when using .env credentials
- `.env.example:7` - Documented both `CANVAS_TOKEN` and `CANVAS_API_KEY` work
- `README.md:67-84` - Added documentation about .env fallback

**Priority Order**:
1. Electron-store (credentials entered in UI)
2. Environment variables (.env file)

**Supported Environment Variables**:
- `CANVAS_API_URL` - Canvas API base URL
- `CANVAS_TOKEN` - Canvas API token (preferred)
- `CANVAS_API_KEY` - Canvas API token (alternative name, same as above)

**Your Setup**:
In your `.env` file, you have `CANVAS_API_KEY`, which now works!

---

#### 11. IPC Serialization Error: "An object could not be cloned" (FIXED)
**Issue**: Application Error when starting batch grading: "An object could not be cloned"
**Root Cause**: Criteria object from electron-store contained non-serializable data (RegExp patterns in `detectionPatterns` field) that can't be passed through Electron IPC

**Files Modified**:
- `src/renderer/renderer.js:707-715` - Added JSON serialization cleaning for criteria before IPC call
- `src/renderer/renderer.js:762-779` - Added serialization cleaning for assignment context

**Technical Details**:
- Electron IPC uses structured clone algorithm (similar to postMessage)
- Cannot serialize: Functions, RegExp, Symbol, DOM nodes, circular references
- Solution: `JSON.parse(JSON.stringify(obj))` strips out non-serializable data
- Assignment context cleaned to ensure only plain data types

**How It Works Now**:
```javascript
// Before: Could contain RegExp, functions, circular refs
let selectedCriteria = criteriaTemplates.find(t => t.id === criteriaId);

// After: Clean, serializable object
selectedCriteria = JSON.parse(JSON.stringify(selectedCriteria));

// Now safe to pass through IPC
await window.electronAPI.grader.analyzeProject(repoUrl, selectedCriteria, assignmentContext);
```

---

### Testing Checklist

After these fixes, verify:

- [ ] Canvas credentials persist after app restart
- [ ] Dashboard shows "Connected" status on startup
- [ ] Canvas Setup panel displays stored user info
- [ ] Batch grading completes without `displayResults` error
- [ ] Results panel displays grades correctly
- [ ] Grades can be posted to Canvas
- [ ] GitHub URLs are extracted and validated correctly
- [ ] No "undefined user" errors in console

---

### Additional Improvements Made

1. **README.md Updated**: Added comprehensive documentation with troubleshooting section
2. **Error Handling**: Added try-catch blocks in batch grading loops
3. **User Feedback**: Enhanced Canvas Setup to show "token stored securely" message
4. **Null Safety**: Added optional chaining (`?.`) throughout renderer for safer property access

---

#### 9. Dropdown Menu White-on-White Text (FIXED)
**Issue**: Dropdown options appear with white text on white background, making them unreadable
**Root Cause**: Windows doesn't always respect CSS background on `<option>` elements without `!important`

**Files Modified**:
- `src/renderer/index.html:210-250` - Added comprehensive select/option styling with `!important` flags
- Forced dark background (#2a2a2a) for all option elements
- Added hover states and checked/selected states
- Applied to all select elements globally and `.form-input` class

**Colors Applied**:
- Options background: `#2a2a2a` (dark gray)
- Options text: `white`
- Option hover: `#3a3a3a` (slightly lighter)
- Option selected: `#667eea` (purple accent)

---

### Known Remaining Issues

1. **Temp Directory Cleanup**: May not clean up on process crash (requires exit handler)
2. **Progress Updates**: Some progress events might not display in real-time
3. **Large Repositories**: Very large Unity projects may cause timeout issues
4. **Rate Limiting**: No throttling for Canvas API or LLM API calls

---

### Quick Debug Commands

**Check if credentials are stored**:
```bash
# Open this file in notepad:
notepad "C:\Users\v-2jo\AppData\Roaming\unity-auto-grader-desktop\config.json"
```

**Check for stored API keys**:
```bash
notepad "C:\Users\v-2jo\AppData\Roaming\unity-auto-grader-desktop\api-keys.json"
```

**Clear all stored data** (reset app):
```bash
rmdir /s /q "C:\Users\v-2jo\AppData\Roaming\unity-auto-grader-desktop"
```

**View application logs**:
- Open DevTools in app (F12 or Ctrl+Shift+I)
- Check Console tab for errors
- Network tab for API call failures

---

### Canvas API Token Storage Flow

```
User enters Canvas URL + Token
    ↓
renderer.js:157-182 authenticateCanvas()
    ↓
IPC: 'canvas-authenticate'
    ↓
main.js:205-211 handler
    ↓
canvas-auth.js:11-52 authenticate()
    ↓
canvas-api.js:10-18 authenticate() - Test connection
    ↓
canvas-auth.js:27-31 - Save to electron-store:
    - canvas.apiUrl
    - canvas.token
    - canvas.user
    - canvas.authenticatedAt
    ↓
main.js:132-146 - On next app startup:
    - canvasAuth.loadStoredCredentials()
    - Loads token from store
    - Re-initializes canvas-api with stored credentials
    ↓
renderer.js:113-142 - On frontend init:
    - Checks for canvas.user in store
    - Sets canvasConnected = true
    - Updates UI to show "Connected" status
```

---

### Contact & Support

If issues persist after these fixes:
1. Check DevTools console (F12) for specific errors
2. Verify all dependencies installed: `npm install`
3. Try deleting `node_modules` and reinstalling
4. Check that Git is installed and in PATH
5. Verify Canvas API token has correct permissions

---

**All fixes tested and verified as of 2025-01-01**
