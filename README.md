# Kreyco Partnership Inquiry Form - Monday.com Integration

A Google Apps Script web application for managing client partnership inquiries with Monday.com integration. Features automatic PDF generation, optimized performance, and comprehensive Google Drive file management with a modern blue-themed responsive interface.

## 🌟 Key Features

### Core Functionality
- **Automatic Dropdown Management**: Fetches dropdown and status values directly from Monday.com - no manual configuration needed
- **Multi-Column Support**: Handles text, textarea, dropdown, status, and color columns across parent items and subitems
- **PDF Submission Capture**: Automatically generates a branded PDF summary and uploads it to Google Drive with a link in Monday.com
- **Optimized Performance**: Async PDF generation ensures fast response times (~22 seconds for 3 teachers with files)

### Data Organization
- **Hierarchical File Structure**: Creates organized folders by school name with teacher sub-folders
- **Smart Permission Inheritance**: Files automatically inherit sharing permissions from parent folder without email notifications
- **Parent & Subitem Architecture**: School details in parent item, individual teacher positions as subitems

### Teacher Management
- **Dynamic Teacher Rows**: Add multiple teacher positions with individual requirements
- **TBD Option**: Submit responses when exact teacher count is still being determined
- **Per-Teacher Customization**: Each teacher has their own:
  - Grade levels, LLN services, languages, REG services
  - Certification and modality preferences
  - Teaching schedule, start date, and last day
  - Optional file upload with Drive integration

### User Interface
- **Modern Design**: Blue-themed (#16367B, #295EE3) responsive interface
- **Dual Add Buttons**: Teacher addition buttons at both top and bottom for convenience
- **Progress Indicators**: Clear feedback during submission process
- **Form Validation**: Comprehensive email, address, and required field validation
- **Mobile-Friendly**: Responsive layout that works on all devices

### Security & Configuration
- **Secure Setup**: API tokens and board IDs stored in Script Properties
- **Link Integration**: Uploaded files automatically linked in Monday.com columns
- **Error Handling**: Graceful fallbacks and comprehensive logging

## 📋 Prerequisites

- Google Account with Google Apps Script access
- Monday.com account with API access
- Monday.com Board ID
- Google Drive folder for file storage (required for PDF generation and file uploads)

## 🚀 Setup Instructions

### Step 1: Create Google Apps Script Project

1. Go to [Google Apps Script](https://script.google.com)
2. Click **New Project**
3. Name your project (e.g., "Kreyco Partnership Form")

### Step 2: Add the Code Files

1. **Code.gs**: 
   - Delete the default `myFunction()` code
   - Paste the entire contents of `Code.gs`

2. **Index.html**:
   - Click the **+** button next to Files
   - Select **HTML**
   - Name it `Index`
   - Paste the entire contents of `Index.html`

### Step 3: Enable Google Drive Service

1. In the Apps Script editor, click the **+** button next to **Services**
2. Find and select **Drive API**
3. Click **Add**

### Step 4: Configure Script Properties

1. Click the **gear icon** (Project Settings) in the left sidebar
2. Scroll down to **Script Properties**
3. Click **Add script property** for each of the following:

| Property Name | Value | Required |
|--------------|-------|----------|
| `MONDAY_API_KEY` | Your Monday.com API token | Yes |
| `MONDAY_BOARD_ID` | Your board ID (e.g., 6938836032) | Yes |
| `DRIVE_FOLDER_ID` | Google Drive folder ID for uploads | Yes* |

*Required for PDF generation and file uploads to work properly

#### How to Get Your Monday.com API Key:
1. Go to Monday.com
2. Click your avatar (top right)
3. Select **Admin** → **API**
4. Copy your API token

#### How to Get Your Board ID:
1. Open your Monday.com board
2. Look at the URL: `https://yourworkspace.monday.com/boards/1234567890`
3. The board ID is the number after `/boards/`

#### How to Get Your Drive Folder ID:
1. Open the folder in Google Drive
2. Look at the URL: `https://drive.google.com/drive/folders/ABC123xyz`
3. The folder ID is the long string after `/folders/`

### Step 5: Update Column IDs

The application uses specific column IDs for Monday.com integration. You need to verify and update these IDs to match your board.

#### Parent Item Column IDs (Code.gs - `createParentItem` function):

```javascript
const columnValues = {
  "text6__1": schoolData.address,              // School Address
  "text__1": schoolData.fullName,              // Your Full Name
  "text5__1": schoolData.email,                // Email Address
  "text3__1": schoolData.calendar,             // School Calendar
  "text12__1": schoolData.teacherDays,         // Teacher/Instructional Days
  "duties__meetings____pd__1": schoolData.duties,     // Duties, Meetings, & PD
  "long_text__1": schoolData.salary,           // Salary & Benefits
  "long_text7__1": schoolData.additionalInfo,  // Additional Info
  "text06__1": schoolData.numberOfTeachers,    // Number of Teachers
  "wf_edit_link_wdlng": pdfUrl                 // Submission Link (PDF URL)
};
```

#### Subitem Column IDs (Code.gs - `createSubitem` function):

```javascript
const columnValues = {
  "long_text_mkzb794g": teacher.description,   // Description
  "text_mkzc34ak": teacher.startDate,          // Desired Start Date
  "text_mkzce7mc": teacher.lastDay,            // Last Day of Instruction
  "text_mkzcyvvk": teacher.teachingSchedule,   // Teaching Schedule
  "dropdown_mkzc6dgm": teacher.gradeLevels,    // Grade Level(s)
  "dropdown_mkzcq8h6": teacher.llnServices,    // LLN Services
  "dropdown_mkzcbcq4": teacher.languages,      // Language(s)
  "dropdown_mkzccht4": teacher.regServices,    // REG Services (English)
  "color_mkzcwqdn": teacher.certification,     // Certification (status)
  "color_mkzcn0h2": teacher.modality,          // Modality Preference (status)
  "link_mkzbkpe4": fileUrl                     // File Link (if uploaded)
};
```

#### Dropdown Columns to Fetch (Code.gs - `getBoardDropdownOptions` function):

```javascript
columns (ids: [
  "dropdown_mkt6esvc",  // Grade Levels (parent board)
  "dropdown_mkt67ese",  // LLN Services (parent board)
  "dropdown_mkt6gc13",  // REG Services (parent board)
  "dropdown_mkt641g1",  // Language(s) (parent board)
  "color_mksnhewa",     // Certification (parent board - for display)
  "status__1"           // Modality Preference (parent board - for display)
])
```

**To find your column IDs:**
1. Go to Monday.com API playground: `https://api.monday.com/graphiql`
2. Run this query (replace with your board ID):

```graphql
query {
  boards (ids: 6938836032) {
    columns {
      id
      title
      type
    }
  }
}
```

3. Match the column titles to your form fields and update the IDs in Code.gs

### Step 6: Deploy as Web App

1. Click **Deploy** → **New deployment**
2. Click the gear icon ⚙️ next to "Select type"
3. Select **Web app**
4. Configure:
   - **Description**: "Kreyco Partnership Form v2.0"
   - **Execute as**: Me
   - **Who has access**: Anyone
5. Click **Deploy**
6. **Authorize access** when prompted (you may need to click "Advanced" → "Go to [Project Name]")
7. Copy the **Web app URL**

### Step 7: Test the Application

1. Open the Web app URL in your browser
2. The form should load with dropdowns automatically populated from Monday.com
3. Fill out a test submission
4. Verify in Monday.com and Google Drive

## 📊 Form Structure

### Section 1: School Information
- Name of School (required)
- Your Full Name (required)
- School Address (required, validated)
- Email Address (required, validated)

### Section 2: Schedule & Contract Details
- School Calendar (required)
- Teacher/Instructional Days (required)
- Duties, Meetings, & PD (required)
- Salary & Benefits (required)
- Should we know anything else? (optional)

### Section 3: Number of Teachers
**TBD Mode**: Check "TBD" to provide description only

**Teacher Rows** (when not TBD):
- Description (optional)
- Teaching Schedule (required)
- Grade Level(s), LLN Services, Language(s), REG Services (required, checkboxes)
- Certification, Modality Preference (required, dropdowns)
- Desired Start Date, Last Day of Instruction (required)
- Upload File (optional)

## 🐛 Troubleshooting

See the comprehensive troubleshooting section in the full README for:
- Dropdowns not loading
- Submission performance issues
- PDF generation problems
- File upload issues
- Link column updates
- TBD checkbox behavior
- Validation errors
- Permission issues

## 🔒 Security Best Practices

1. Never hard-code API keys
2. Use Script Properties for sensitive data
3. Regular key rotation (every 90 days)
4. Monitor execution logs
5. Validate all inputs

## 🔄 Version History

**v2.0** (2025-01-07): Major update with PDF generation, performance optimization, field restructuring

**v1.0** (2025-01-07): Initial release

---

**Built with ❤️ for Kreyco Partnership Inquiries**
