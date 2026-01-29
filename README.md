# 📚 Code Documentation Guide for New Hires

## Overview

This document explains the Kreyco Partnership Inquiry Form codebase to help new developers understand and maintain the system.

## 📁 File Structure

```
Project/
├── Code.gs              # Backend (Google Apps Script)
└── Index.html           # Frontend (HTML/CSS/JavaScript)
```

## 🔧 Code.gs - Backend Documentation

### Purpose
Handles form submissions and creates structured data in Monday.com with automated Google Drive file management.

### Key Sections

#### 1. **Configuration & Initialization (Lines 1-32)**
- `doGet()`: Serves the HTML interface to users
- `getConfig()`: Retrieves API keys and IDs from Script Properties (like environment variables)

**For New Hires:**
- Script Properties keep secrets separate from code (more secure)
- Access via: Project Settings → Script Properties

#### 2. **Monday.com API Integration (Lines 34-130)**
- `getBoardDropdownOptions()`: Fetches dropdown options from Monday.com automatically
  - **Why**: No need to hardcode dropdown values - they update automatically when Monday.com board changes
  - **Returns**: Object with column IDs mapped to their available options
  
- `callMondayAPI()`: Makes all API calls to Monday.com
  - **Uses**: GraphQL (query language for APIs)
  - **Headers**: Includes API key for authentication
  
- `escapeGql()`: Sanitizes text for GraphQL queries
  - **Why**: Prevents errors from special characters like quotes and newlines

**For New Hires:**
- Monday.com uses GraphQL, not REST
- All queries go through `callMondayAPI()` helper function
- Always escape user input with `escapeGql()`

#### 3. **Main Submission Processing (Lines 132-170)**
- `processApplication()`: Coordinates the entire submission workflow
  1. Creates parent item (school info)
  2. Uploads school calendar
  3. Creates teacher subitems
  4. Generates PDF (asynchronously)
  
**Processing Flow:**
```
User clicks Submit
    ↓
processApplication() runs
    ↓
Creates Monday.com items
    ↓
Uploads files to Drive
    ↓
Returns success to user immediately
    ↓
PDF generates in background (doesn't slow down response)
```

**For New Hires:**
- Function returns success quickly (~22 seconds)
- PDF generation happens AFTER user sees success
- Uses `Utilities.sleep(100)` to ensure response sent first

#### 4. **Monday.com Item Creation (Lines 172-310)**
- `createParentItem()`: Creates main board item with school information
  - **Column Mapping**: Object where keys = column IDs, values = data
  - Example: `"text6__1": schoolData.address`
  
- `uploadSchoolCalendar()`: Uploads calendar file to Google Drive
  - **Location**: Main Folder > School Name > calendar-file.pdf
  - **Process**: Base64 decode → Create blob → Upload → Inherit permissions
  
- `processTeachers()`: Creates subitems and uploads teacher files
  - **Returns**: Teachers array with added `fileUrl` property
  - **Important**: This returned data is used by PDF generator
  
- `createSubitem()`: Creates individual teacher subitem
  - **Dropdowns**: Format as `{ labels: ["Option 1", "Option 2"] }`
  - **Status**: Format as `{ label: "Selected Option" }`

**For New Hires:**
- Parent board = School-level info
- Subitem board = Teacher-level info
- Column IDs must match your Monday.com board exactly
- Find column IDs using Monday.com API playground

#### 5. **File Upload Functions (Lines 312-380)**
- `updateSubitemFile()`: Adds file link to Monday.com
  - **Tries 3 formats**: Monday.com can be picky about link format
  - **Fallback**: Creates comment if all formats fail
  
- `createItemUpdate()`: Adds comment to Monday.com item

**For New Hires:**
- Always try multiple formats for Monday.com links
- Never throw error - use fallback methods
- Log everything for debugging

#### 6. **Google Drive Helpers (Lines 382-450)**
- `getOrCreateFolder()`: Gets existing folder or creates new one
  - **Pattern**: Check if exists → Return existing OR create new
  
- `inheritFolderPermissions()`: Copies sharing from parent to child folder
  - **Important**: Does NOT send email notifications
  - **Why**: Keeps inbox clean for users
  
- `inheritFilePermissions()`: Same for files

**For New Hires:**
- Always inherit permissions from main folder
- This ensures consistent access control
- Use silent sharing (no notifications)

#### 7. **PDF Generation (Lines 452-750)**
- `generateAndUploadPDF()`: Wrapper that runs after user response
  - **Timing**: Called with 100ms delay
  - **Error handling**: Fails silently (doesn't break submission)
  
- `generateSubmissionPDF()`: Creates branded PDF summary
  - **Uses**: HTML → PDF conversion
  - **Styling**: Inline CSS (external stylesheets don't work)
  - **Includes**: School info, teachers, clickable file links
  
- `escapeHtml()`: Sanitizes text for PDF
  - **Why**: Prevents XSS attacks in PDF content
  
- `updateParentItemLink()`: Adds PDF link to Monday.com

**For New Hires:**
- PDF uses inline CSS only
- Always escape user input
- File links are clickable in PDF
- Brand colors: #16367B (dark blue), #295EE3 (bright blue)

### Common Modifications

**Adding a New Field:**
1. Add field to HTML form
2. Collect in `schoolData` object (frontend)
3. Add column mapping in `createParentItem()` or `createSubitem()`
4. Add to PDF template in `generateSubmissionPDF()`
5. Update column ID comments

**Changing Colors:**
- Search for `#16367B` and `#295EE3`
- Replace with your brand colors
- Update both CSS and PDF styles

**Adding New Dropdown:**
1. Add column ID to `getBoardDropdownOptions()` query
2. Add field to HTML form
3. Map in `createSubitem()` column values
4. Update frontend to collect the data

---

## 🎨 Index.html - Frontend Documentation

### Purpose
User-facing web form with responsive design, dark mode, and dynamic teacher fields.

### Key Sections

#### 1. **Head Section (Lines 1-145)**
- Tailwind CSS configuration
- Custom brand colors
- Dark mode styles
- Font Awesome icons

**For New Hires:**
- Tailwind = utility-first CSS framework
- Brand colors defined in `tailwind.config`
- Dark mode uses `.dark` class on `<html>`

#### 2. **Navigation (Lines 146-195)**
- Logo
- Theme toggle button
- Theme dropdown menu
- Kreyco website link

**For New Hires:**
- Theme saved to localStorage
- System theme uses `prefers-color-scheme`
- Three modes: Light, Dark, System

#### 3. **Form Sections (Lines 196-350)**

**Section 1: School Information**
- Name of School (full width)
- Address (full width)
- Title (1/3) + Full Name (2/3) - same row
- Email (full width)

**Section 2: Schedule & Contract**
- School Calendar (file upload)
- Teacher Days
- Duties, Meetings, & PD
- Salary & Benefits
- Additional Info (optional)

**Section 3: Teachers**
- Highlighted description box
- TBD checkbox option
- Dynamic teacher rows
- Add Teacher buttons (top and bottom)

**For New Hires:**
- Form uses grid layout (responsive)
- Validation happens on submit
- Required fields marked with red asterisk

#### 4. **Teacher Template (Lines 350-450)**
Dynamic template cloned for each teacher:
- Description (optional textarea)
- Teaching Schedule (required)
- Grade Levels (checkboxes, 3-column)
- LLN Services (checkboxes)
- Languages (checkboxes)
- REG Services (checkboxes, full width)
- Certification (dropdown)
- Modality (dropdown)
- Start Date + Last Day (side by side)
- File upload (optional)

**For New Hires:**
- Template cloned by `addTeacherRow()`
- Checkboxes populate from Monday.com
- File converts to base64 before upload

#### 5. **JavaScript Functions (Lines 500-1100)**

**Initialization:**
- `window.onload`: Runs when page loads
  - Adds first teacher row
  - Fetches dropdown options
  - Sets up calendar file listener

**Theme Management:**
- `initTheme()`: Sets up theme toggle
- `applyTheme()`: Applies selected theme
  - Adds/removes `.dark` class
  - Updates icon
  - Saves to localStorage

**Teacher Management:**
- `addTeacherRow()`: Clones teacher template
  - Increments teacher counter
  - Populates checkboxes with Monday.com data
  - Sets up file upload listener
  
- `populateTeacherCheckboxes()`: Fills checkbox options
  - Runs for each new teacher row
  - Uses data from `getBoardDropdownOptions()`

**TBD Toggle:**
- Hides all teacher fields
- Shows TBD description box
- Removes required attributes
- Reverses when unchecked

**Form Submission:**
- `form.addEventListener('submit')`: Main handler
  1. Prevents default submission
  2. Validates all fields
  3. Collects school data
  4. Collects teacher data (with files)
  5. Sends to backend
  6. Shows success/error message
  7. Resets form

**File Handling:**
- `readFileAsBase64()`: Converts file to base64
  - **Why**: Google Apps Script can't handle raw file data
  - **Returns**: Promise with base64 string

**Helper Functions:**
- `getVal()`: Gets input value
- `handleError()`: Shows error messages
- `populateDropdowns()`: Fills checkboxes from Monday.com

**For New Hires:**
- All form data collected in one object
- Files converted to base64
- Title merged with name before sending
- Async/await used for file reading

### Form Validation

**Built-in HTML5 Validation:**
- Required fields (marked with `*`)
- Email format
- Minimum lengths

**Custom JavaScript Validation:**
- Address must be 10+ characters
- At least one checkbox in each group
- Email format check
- File size limits (handled by browser)

**For New Hires:**
- `required` attribute triggers browser validation
- Custom validation in submit handler
- Error messages show below fields

### Dark Mode Implementation

**How It Works:**
1. User clicks theme toggle
2. JavaScript saves choice to localStorage
3. Applies `.dark` class to `<html>`
4. CSS `.dark` selectors activate
5. Theme persists across page loads

**System Theme:**
- Detects OS preference
- Uses `window.matchMedia('(prefers-color-scheme: dark)')`
- Updates automatically if OS changes

**Visual Enhancements:**
- Logo has white glow in dark mode
- Icons have blue glow
- Icon backgrounds brighter
- Better contrast throughout

**For New Hires:**
- All dark mode CSS starts with `.dark`
- Use `!important` to override Tailwind
- Test both light and dark modes
- Consider color contrast (WCAG guidelines)

---

## 🔍 Common Debugging Tips

### Backend (Code.gs)

**View Logs:**
1. Click "Executions" (clock icon)
2. Find your execution
3. View logs

**Test API Queries:**
1. Go to https://api.monday.com/graphiql
2. Paste your query
3. Test with your board ID

**Common Errors:**
- "Board not found": Check `MONDAY_BOARD_ID`
- "Invalid API key": Check `MONDAY_API_KEY`
- "Column not found": Verify column IDs match your board
- "Mutation failed": Check data format (dropdowns vs status)

### Frontend (Index.html)

**View Console:**
1. Press F12
2. Go to Console tab
3. See errors and logs

**Common Issues:**
- Dropdowns not loading: Check API key in Script Properties
- Form won't submit: Check browser console for errors
- Files not uploading: Check file size and format
- Dark mode not working: Check localStorage for 'theme'

**Testing Tips:**
- Use mock data option for testing without backend
- Test with various file types and sizes
- Try all three theme modes
- Test on mobile device
- Validate with screen reader (accessibility)

---

## 🚀 Deployment Checklist

**Before Deploying:**
- [ ] Update Script Properties (API key, board ID, folder ID)
- [ ] Enable Drive API service
- [ ] Test with sample data
- [ ] Verify column IDs match your board
- [ ] Check file upload limits
- [ ] Test dark mode
- [ ] Test on mobile
- [ ] Review error handling
- [ ] Check permissions on Drive folder

**After Deploying:**
- [ ] Test web app URL
- [ ] Submit test form
- [ ] Verify Monday.com items created
- [ ] Check Drive files uploaded
- [ ] Confirm PDF generated
- [ ] Test TBD mode
- [ ] Verify email validation
- [ ] Test with multiple teachers

---

## 📞 Support Resources

**Monday.com:**
- API Docs: https://developer.monday.com/api-reference
- GraphiQL Playground: https://api.monday.com/graphiql
- Community: https://community.monday.com

**Google Apps Script:**
- Docs: https://developers.google.com/apps-script
- Reference: https://developers.google.com/apps-script/reference

**Tailwind CSS:**
- Docs: https://tailwindcss.com/docs
- Playground: https://play.tailwindcss.com

---

## 📝 Quick Reference

### Important IDs to Update
| Item | Where to Find | Where to Update |
|------|--------------|-----------------|
| Board ID | Monday.com URL | Script Properties |
| API Key | Monday.com Admin | Script Properties |
| Folder ID | Google Drive URL | Script Properties |
| Column IDs | API Playground | Code.gs (multiple places) |

### File Upload Limits
- Max file size: ~50MB (Apps Script limit)
- Accepted formats: All (no restrictions in code)
- Multiple files: One per teacher

### Brand Colors
- Primary Blue: `#16367B`
- Accent Blue: `#295EE3`
- Light Blue: `#2a4ea3`
- Dark Blue: `#0f265a`

### Performance Metrics
- Form load: ~2 seconds
- Submission (3 teachers): ~22 seconds
- PDF generation: ~5 seconds (background)

---

**Last Updated:** 2025-01-07
**Version:** 2.0
**Maintainer:** Kreyco Development Team
