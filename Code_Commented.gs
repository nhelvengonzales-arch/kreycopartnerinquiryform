/**
 * ========================================================================
 * KREYCO PARTNERSHIP INQUIRY FORM - BACKEND (Google Apps Script)
 * ========================================================================
 * 
 * PURPOSE:
 * This script handles form submissions from the web interface and creates
 * structured data in Monday.com with automated file management in Google Drive.
 * 
 * SETUP INSTRUCTIONS:
 * 1. Go to Project Settings (gear icon) > Script Properties
 * 2. Add these three properties:
 *    - MONDAY_API_KEY = your Monday.com API token
 *    - MONDAY_BOARD_ID = your board ID (e.g., 6938836032)
 *    - DRIVE_FOLDER_ID = your Google Drive folder ID for file uploads
 * 3. Enable Drive API: Services > + Add a service > Drive API
 * 4. Deploy as Web App: Deploy > New deployment > Web app
 * 
 * DATA STRUCTURE:
 * - Parent Item (Monday.com): School-level information
 * - Subitems: Individual teacher positions
 * - Google Drive: School folders with calendar, teacher files, and PDF
 * 
 * FILE ORGANIZATION:
 * Main Folder/
 *   └── School Name/
 *       ├── calendar-file.pdf (School calendar upload)
 *       ├── School Name - Submission - [ItemID].pdf (Auto-generated summary)
 *       └── Teacher 1 - [SubitemID] - [ParentID]/
 *           └── resume.pdf (Teacher file upload)
 * 
 * @version 2.0
 * @date 2025-01-07
 */

// ========================================================================
// SECTION 1: WEB APP INITIALIZATION
// ========================================================================

/**
 * Serves the HTML interface to users
 * This function runs when someone visits the deployed web app URL
 * 
 * @param {Object} e - Event parameter (not used but required by Apps Script)
 * @returns {HtmlOutput} The rendered HTML page
 */
function doGet(e) {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Kreyco Partnership Inquiry Form')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Retrieves configuration from Script Properties
 * Script Properties are like environment variables - they keep sensitive
 * data (API keys, IDs) separate from the code
 * 
 * @returns {Object} Configuration object with boardId, driveFolderId, apiKey
 */
function getConfig() {
  const props = PropertiesService.getScriptProperties();
  return {
    boardId: props.getProperty('MONDAY_BOARD_ID'),      // Monday.com board ID
    driveFolderId: props.getProperty('DRIVE_FOLDER_ID'), // Google Drive folder ID
    apiKey: props.getProperty('MONDAY_API_KEY')          // Monday.com API token
  };
}

// ========================================================================
// SECTION 2: MONDAY.COM API INTEGRATION
// ========================================================================

/**
 * Fetches dropdown and status column options from Monday.com
 * This runs when the form loads and populates all the checkboxes and dropdowns
 * automatically, so we don't have to hardcode the options
 * 
 * HOW IT WORKS:
 * 1. Queries Monday.com for all column definitions
 * 2. Extracts the available options from each column
 * 3. Returns them as a JavaScript object
 * 4. Frontend uses this to build checkboxes and dropdowns
 * 
 * @returns {Object} Map of column IDs to their available options
 * Example: { "dropdown_abc123": { title: "Grade Levels", labels: ["K", "1st", "2nd"] } }
 */
function getBoardDropdownOptions() {
  const config = getConfig();
  
  // Validate that board ID is configured
  if (!config.boardId) {
    throw new Error("MONDAY_BOARD_ID not configured in Script Properties");
  }

  // GraphQL query to fetch column definitions from Monday.com
  // We're querying the PARENT board because that's where display values come from
  const query = `
    query {
      boards (ids: ${config.boardId}) {
        columns (ids: [
          "dropdown_mkt6esvc",  # Grade Levels
          "dropdown_mkt67ese",  # LLN Services
          "dropdown_mkt6gc13",  # REG Services
          "dropdown_mkt641g1",  # Languages
          "color_mksnhewa",     # Certification (status column)
          "status__1"           # Modality Preference (status column)
        ]) {
          id
          title
          type
          settings_str
        }
      }
    }
  `;

  // Send the query to Monday.com API
  const response = callMondayAPI(query);
  
  // Check for errors in the response
  if (!response.data || !response.data.boards || response.data.boards.length === 0) {
    throw new Error("Failed to fetch board data from Monday.com");
  }

  const columns = response.data.boards[0].columns;
  const options = {};
  
  // Process each column and extract its available options
  columns.forEach(column => {
    try {
      const settings = JSON.parse(column.settings_str);
      
      // Dropdown columns have a "labels" array in their settings
      if (column.type === 'dropdown' && settings.labels) {
        options[column.id] = {
          title: column.title,
          type: column.type,
          labels: settings.labels.map(label => ({ name: label.name }))
        };
      } 
      // Status and color columns also have labels
      else if ((column.type === 'color' || column.type === 'status') && settings.labels) {
        options[column.id] = {
          title: column.title,
          type: column.type,
          labels: Object.values(settings.labels).map(label => ({ name: label }))
        };
      }
    } catch (parseError) {
      Logger.log(`Error parsing settings for column ${column.id}: ${parseError}`);
    }
  });
  
  return options;
}

/**
 * Makes API calls to Monday.com using GraphQL
 * This is a helper function used by all other Monday.com functions
 * 
 * @param {string} query - GraphQL query or mutation to execute
 * @returns {Object} Parsed JSON response from Monday.com
 */
function callMondayAPI(query) {
  const config = getConfig();
  
  // Set up the HTTP request
  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'Authorization': config.apiKey  // API key goes in the Authorization header
    },
    payload: JSON.stringify({ query: query }),
    muteHttpExceptions: true  // Don't throw errors automatically - we'll handle them
  };

  // Send the request
  const response = UrlFetchApp.fetch('https://api.monday.com/v2', options);
  return JSON.parse(response.getContentText());
}

/**
 * Escapes special characters for GraphQL queries
 * GraphQL requires quotes, newlines, and backslashes to be escaped
 * 
 * @param {string} str - String to escape
 * @returns {string} Escaped string safe for GraphQL
 * 
 * Example: 
 * Input: She said "hello"
 * Output: She said \"hello\"
 */
function escapeGql(str) {
  if (!str) return '';
  return str
    .replace(/\\/g, '\\\\')   // Escape backslashes first
    .replace(/"/g, '\\"')      // Escape double quotes
    .replace(/\n/g, '\\n')     // Escape newlines
    .replace(/\r/g, '\\r');    // Escape carriage returns
}

// ========================================================================
// SECTION 3: MAIN SUBMISSION PROCESSING
// ========================================================================

/**
 * Main entry point for form submissions
 * This function coordinates the entire submission process:
 * 1. Create parent item in Monday.com with school info
 * 2. Upload school calendar to Drive (if provided)
 * 3. Create teacher subitems with their details
 * 4. Generate PDF summary in background
 * 
 * PROCESSING ORDER:
 * User clicks Submit → This function runs → Returns success immediately →
 * PDF generates in background (doesn't slow down user experience)
 * 
 * @param {Object} data - Form data from frontend containing schoolData and teachers array
 * @returns {Object} Success/failure message for the user
 */
function processApplication(data) {
  try {
    const config = getConfig();
    
    // STEP 1: Create the parent item in Monday.com with school information
    Logger.log("Creating parent item...");
    const parentId = createParentItem(data.schoolData);
    Logger.log(`Parent item created with ID: ${parentId}`);
    
    // STEP 2: Upload school calendar file if one was provided
    if (data.schoolData.calendarFileData && data.schoolData.calendarFileName) {
      try {
        Logger.log("Uploading school calendar...");
        const mainFolder = config.driveFolderId ? DriveApp.getFolderById(config.driveFolderId) : null;
        if (mainFolder) {
          uploadSchoolCalendar(data.schoolData, parentId, mainFolder);
          Logger.log("School calendar uploaded successfully");
        }
      } catch (calendarError) {
        // Log error but don't fail the entire submission
        Logger.log("Error uploading school calendar: " + calendarError.toString());
      }
    }
    
    // STEP 3: Process teacher subitems (creates subitems and uploads their files)
    // This function returns the teachers array with added fileUrl properties
    let teachersWithFiles = data.teachers || [];
    if (data.teachers && data.teachers.length > 0) {
      Logger.log(`Processing ${data.teachers.length} teacher(s)...`);
      const mainFolder = config.driveFolderId ? DriveApp.getFolderById(config.driveFolderId) : null;
      teachersWithFiles = processTeachers(data.teachers, parentId, mainFolder, data.schoolData.schoolName);
      Logger.log("Teachers processed successfully");
    }
    
    // STEP 4: Generate PDF summary (runs AFTER user gets success response)
    // We use a small delay to ensure the user's browser gets the response first
    try {
      const mainFolder = config.driveFolderId ? DriveApp.getFolderById(config.driveFolderId) : null;
      if (mainFolder) {
        Utilities.sleep(100); // 100ms delay to ensure response is sent first
        const dataWithUrls = Object.assign({}, data, { teachers: teachersWithFiles });
        generateAndUploadPDF(dataWithUrls, parentId, mainFolder);
        Logger.log("PDF generation scheduled");
      }
    } catch (pdfError) {
      // PDF generation failure shouldn't affect the submission
      Logger.log("Error scheduling PDF generation: " + pdfError.toString());
    }

    // Return success message to the user
    return { success: true, message: "Response submitted successfully!" };

  } catch (error) {
    // If anything goes wrong, log it and return an error message
    Logger.log("Error processing response: " + error.toString());
    return { success: false, message: "Error: " + error.toString() };
  }
}

/**
 * Creates the parent item in Monday.com with school information
 * Parent item contains: school name, address, contact info, schedule details
 * 
 * COLUMN MAPPING:
 * - text6__1: School Address
 * - text__1: Contact Full Name (with title merged)
 * - text5__1: Email Address
 * - text12__1: Teacher/Instructional Days
 * - duties__meetings____pd__1: Duties, Meetings, & PD
 * - long_text__1: Salary & Benefits
 * - long_text7__1: Additional Info
 * - text06__1: Number of Teachers
 * 
 * @param {Object} schoolData - School information from the form
 * @returns {string} The ID of the created Monday.com item
 */
function createParentItem(schoolData) {
  const config = getConfig();
  
  // Build the column values object
  // Each key is a column ID, each value is what goes in that column
  const columnValues = {
    "text6__1": schoolData.address,
    "text__1": schoolData.fullName,  // Already has title merged from frontend
    "text5__1": schoolData.email,
    "text12__1": schoolData.teacherDays,
    "duties__meetings____pd__1": schoolData.duties,
    "long_text__1": schoolData.salary,
    "long_text7__1": schoolData.additionalInfo,
    "text06__1": schoolData.numberOfTeachers
  };

  // GraphQL mutation to create the item
  // Item name = School name
  // Column values are passed as a JSON string
  const query = `
    mutation {
      create_item (
        board_id: ${config.boardId}, 
        item_name: "${escapeGql(schoolData.schoolName)}", 
        column_values: ${JSON.stringify(JSON.stringify(columnValues))}
      ) {
        id
      }
    }
  `;

  const response = callMondayAPI(query);
  
  // Check if the mutation was successful
  if (response.errors) {
    throw new Error("Monday API Error (Create Parent): " + JSON.stringify(response.errors));
  }
  
  // Return the new item's ID so we can create subitems under it
  return response.data.create_item.id;
}

/**
 * Uploads school calendar file to Google Drive
 * File goes in: Main Folder > School Name > calendar-file.pdf
 * 
 * @param {Object} schoolData - Contains calendar file data, name, and MIME type
 * @param {string} parentId - Monday.com parent item ID (used for logging)
 * @param {Folder} mainFolder - Root Google Drive folder
 * @returns {string} URL of the uploaded calendar file
 */
function uploadSchoolCalendar(schoolData, parentId, mainFolder) {
  try {
    // Get or create the school's folder
    const schoolFolder = getOrCreateFolder(mainFolder, schoolData.schoolName);
    
    // Convert base64 file data to a blob (binary data)
    const blob = Utilities.newBlob(
      Utilities.base64Decode(schoolData.calendarFileData),
      schoolData.calendarMimeType,
      schoolData.calendarFileName
    );
    
    // Upload the file to the school folder
    const file = schoolFolder.createFile(blob);
    
    // Make sure the file inherits sharing permissions from the parent folder
    inheritFilePermissions(file, mainFolder);
    
    Logger.log("School calendar uploaded successfully: " + file.getUrl());
    return file.getUrl();
    
  } catch (error) {
    Logger.log("Error uploading school calendar: " + error.toString());
    throw error;
  }
}

/**
 * Processes teacher subitems with file uploads
 * Creates a subitem for each teacher and uploads their files to Drive
 * 
 * FOLDER STRUCTURE:
 * Main Folder > School Name > Teacher # - SubitemID - ParentID > file.pdf
 * 
 * IMPORTANT: This function returns the teachers array with added fileUrl property
 * so the PDF generator can include clickable links to uploaded files
 * 
 * @param {Array} teachers - Array of teacher objects from the form
 * @param {string} parentId - Parent item ID to attach subitems to
 * @param {Folder} mainFolder - Root Google Drive folder
 * @param {string} schoolName - School name for folder organization
 * @returns {Array} Teachers array with added fileUrl property for each teacher
 */
function processTeachers(teachers, parentId, mainFolder, schoolName) {
  // If no Drive folder is configured, still create subitems but skip file uploads
  if (!mainFolder) {
    Logger.log("Warning: No Drive folder configured. Files will not be uploaded.");
    teachers.forEach((teacher, index) => {
      try {
        createSubitem(parentId, teacher);
      } catch (e) {
        Logger.log("Error creating subitem " + teacher.name + ": " + e.toString());
      }
    });
    return teachers;
  }

  // Get or create the school's folder (created once, used for all teachers)
  let schoolFolder = getOrCreateFolder(mainFolder, schoolName);
  
  // Array to store teachers with their file URLs
  const teachersWithUrls = [];
  
  // Process each teacher
  teachers.forEach((teacher, index) => {
    try {
      // STEP 1: Create the subitem in Monday.com
      const subitemId = createSubitem(parentId, teacher);
      const teacherNumber = teacher.teacherNumber || (index + 1);
      
      // Create a copy of the teacher object to add fileUrl property
      const teacherWithUrl = Object.assign({}, teacher);

      // STEP 2: If teacher has a file, upload it to Drive
      if (teacher.fileData && teacher.fileName && subitemId) {
        
        // Create folder: "Teacher 1 - SubitemID - ParentID"
        const folderName = `Teacher ${teacherNumber} - ${subitemId} - ${parentId}`;
        const teacherFolder = schoolFolder.createFolder(folderName);
        
        // Inherit sharing permissions from main folder (no email notifications)
        inheritFolderPermissions(teacherFolder, mainFolder);
        
        // Convert base64 file data to blob
        const blob = Utilities.newBlob(
          Utilities.base64Decode(teacher.fileData), 
          teacher.mimeType, 
          teacher.fileName
        );
        
        // Upload file to teacher's folder
        const file = teacherFolder.createFile(blob);
        
        // Inherit sharing permissions for the file
        inheritFilePermissions(file, mainFolder);
        
        const fileUrl = file.getUrl();
        
        // Add file URL to teacher object (used by PDF generator)
        teacherWithUrl.fileUrl = fileUrl;

        // STEP 3: Update the subitem with the file link
        try {
          updateSubitemFile(subitemId, fileUrl);
          Logger.log("Successfully updated link column for subitem " + subitemId);
        } catch (linkError) {
          // If link column update fails, add as a comment instead
          Logger.log("Failed to update link column for subitem " + subitemId + ": " + linkError.toString());
          createItemUpdate(subitemId, `File uploaded: <a href="${fileUrl}" target="_blank">View File</a>`);
        }
      }
      
      // Add teacher (with or without fileUrl) to results array
      teachersWithUrls.push(teacherWithUrl);
      
    } catch (e) {
      Logger.log("Error processing teacher " + teacher.name + ": " + e.toString());
      teachersWithUrls.push(teacher); // Add original even if failed
    }
  });
  
  return teachersWithUrls;
}

/**
 * Creates a subitem (teacher) under the parent item in Monday.com
 * Subitems contain all teacher-specific information
 * 
 * COLUMN MAPPING (Subitem Board):
 * - long_text_mkzb794g: Description
 * - text_mkzc34ak: Desired Start Date
 * - text_mkzce7mc: Last Day of Instruction
 * - text_mkzcyvvk: Teaching Schedule
 * - dropdown_mkzc6dgm: Grade Level(s)
 * - dropdown_mkzcq8h6: LLN Services
 * - dropdown_mkzcbcq4: Language(s)
 * - dropdown_mkzccht4: REG Services (English)
 * - color_mkzcwqdn: Certification (status)
 * - color_mkzcn0h2: Modality Preference (status)
 * 
 * @param {string} parentId - Parent item ID to create subitem under
 * @param {Object} teacher - Teacher data from the form
 * @returns {string} The ID of the created subitem
 */
function createSubitem(parentId, teacher) {
  const config = getConfig();

  // Build column values for the subitem
  const columnValues = {
    "long_text_mkzb794g": teacher.description || "",
    "text_mkzc34ak": teacher.startDate || "",
    "text_mkzce7mc": teacher.lastDay || "",
    "text_mkzcyvvk": teacher.teachingSchedule || ""
  };

  // Add dropdown columns (multi-select checkboxes from the form)
  // Format: { labels: ["Option 1", "Option 2"] }
  if (teacher.gradeLevels && teacher.gradeLevels.length > 0) {
    columnValues["dropdown_mkzc6dgm"] = { labels: teacher.gradeLevels };
  }
  if (teacher.llnServices && teacher.llnServices.length > 0) {
    columnValues["dropdown_mkzcq8h6"] = { labels: teacher.llnServices };
  }
  if (teacher.languages && teacher.languages.length > 0) {
    columnValues["dropdown_mkzcbcq4"] = { labels: teacher.languages };
  }
  if (teacher.regServices && teacher.regServices.length > 0) {
    columnValues["dropdown_mkzccht4"] = { labels: teacher.regServices };
  }

  // Add status columns (single select dropdowns from the form)
  // Format: { label: "Selected Option" }
  if (teacher.certification) {
    columnValues["color_mkzcwqdn"] = { label: teacher.certification };
  }
  if (teacher.modality) {
    columnValues["color_mkzcn0h2"] = { label: teacher.modality };
  }

  // GraphQL mutation to create the subitem
  // Item name = Teacher name/position
  const query = `
    mutation {
      create_subitem (
        parent_item_id: ${parentId}, 
        item_name: "${escapeGql(teacher.name)}", 
        column_values: ${JSON.stringify(JSON.stringify(columnValues))}
      ) {
        id
      }
    }
  `;

  const response = callMondayAPI(query);
  
  if (response.errors) {
    throw new Error("Monday API Error (Create Subitem): " + JSON.stringify(response.errors));
  }
  
  return response.data.create_subitem.id;
}

/**
 * Updates the subitem's link column with the uploaded file URL
 * Tries multiple link formats to ensure Monday.com accepts it
 * 
 * @param {string} subitemId - The subitem ID to update
 * @param {string} fileUrl - Google Drive file URL
 */
function updateSubitemFile(subitemId, fileUrl) {
  const config = getConfig();

  // Try different link formats (Monday.com can be picky about format)
  const linkFormats = [
    // Format 1: Object with url and text
    JSON.stringify({ url: fileUrl, text: "View File" }),
    // Format 2: Double-stringified object
    JSON.stringify(JSON.stringify({ url: fileUrl, text: "View File" })),
    // Format 3: Just the URL
    JSON.stringify(fileUrl)
  ];

  // Try each format until one works
  for (let i = 0; i < linkFormats.length; i++) {
    try {
      const query = `
        mutation {
          change_column_value (
            board_id: ${config.boardId},
            item_id: ${subitemId},
            column_id: "link_mkzbkpe4",
            value: ${linkFormats[i]}
          ) {
            id
          }
        }
      `;

      const response = callMondayAPI(query);
      
      if (!response.errors) {
        Logger.log(`Link format ${i + 1} worked for subitem ${subitemId}`);
        return; // Success! Exit the function
      }
    } catch (e) {
      Logger.log(`Link format ${i + 1} failed: ${e.toString()}`);
    }
  }
  
  // If all formats failed, throw an error
  throw new Error("All link formats failed");
}

/**
 * Creates a comment/update on a Monday.com item
 * Used as a fallback if link column update fails
 * 
 * @param {string} itemId - Item ID to add comment to
 * @param {string} body - Comment text (HTML allowed)
 */
function createItemUpdate(itemId, body) {
  const query = `
    mutation {
      create_update (
        item_id: ${itemId},
        body: "${escapeGql(body)}"
      ) {
        id
      }
    }
  `;
  
  callMondayAPI(query);
}

// ========================================================================
// SECTION 4: GOOGLE DRIVE HELPER FUNCTIONS
// ========================================================================

/**
 * Gets an existing folder by name, or creates it if it doesn't exist
 * Used to create school folders under the main folder
 * 
 * @param {Folder} parentFolder - Parent folder to search/create in
 * @param {string} folderName - Name of folder to get/create
 * @returns {Folder} The found or newly created folder
 */
function getOrCreateFolder(parentFolder, folderName) {
  // Search for existing folder with this name
  const folders = parentFolder.getFoldersByName(folderName);
  
  // If folder exists, return it
  if (folders.hasNext()) {
    return folders.next();
  }
  
  // If folder doesn't exist, create it
  Logger.log("Creating new folder: " + folderName);
  return parentFolder.createFolder(folderName);
}

/**
 * Copies all sharing permissions from one folder to another
 * This ensures new folders have the same access as the parent folder
 * Does NOT send email notifications to users
 * 
 * @param {Folder} targetFolder - Folder to apply permissions to
 * @param {Folder} sourceFolder - Folder to copy permissions from
 */
function inheritFolderPermissions(targetFolder, sourceFolder) {
  try {
    // Get all viewers from source folder
    const viewers = sourceFolder.getViewers();
    viewers.forEach(viewer => {
      targetFolder.addViewer(viewer.getEmail());
    });
    
    // Get all editors from source folder
    const editors = sourceFolder.getEditors();
    editors.forEach(editor => {
      targetFolder.addEditor(editor.getEmail());
    });
    
    Logger.log("Inherited permissions for folder: " + targetFolder.getName());
  } catch (e) {
    Logger.log("Error inheriting folder permissions: " + e.toString());
  }
}

/**
 * Copies all sharing permissions from a folder to a file
 * This ensures new files have the same access as their parent folder
 * Does NOT send email notifications to users
 * 
 * @param {File} targetFile - File to apply permissions to
 * @param {Folder} sourceFolder - Folder to copy permissions from
 */
function inheritFilePermissions(targetFile, sourceFolder) {
  try {
    // Get all viewers from source folder
    const viewers = sourceFolder.getViewers();
    viewers.forEach(viewer => {
      targetFile.addViewer(viewer.getEmail());
    });
    
    // Get all editors from source folder
    const editors = sourceFolder.getEditors();
    editors.forEach(editor => {
      targetFile.addEditor(editor.getEmail());
    });
    
    Logger.log("Inherited permissions for file: " + targetFile.getName());
  } catch (e) {
    Logger.log("Error inheriting file permissions: " + e.toString());
  }
}

// ========================================================================
// SECTION 5: PDF GENERATION
// ========================================================================

/**
 * Wrapper function to generate and upload PDF asynchronously
 * This is called AFTER the user receives their success message
 * so PDF generation doesn't slow down the submission response
 * 
 * @param {Object} data - Complete form data including teachers with file URLs
 * @param {string} parentId - Monday.com parent item ID
 * @param {Folder} mainFolder - Root Google Drive folder
 */
function generateAndUploadPDF(data, parentId, mainFolder) {
  try {
    // Generate the PDF and get its URL
    const pdfUrl = generateSubmissionPDF(data.schoolData, data.teachers, parentId, mainFolder);
    
    // Update the parent item with the PDF link
    if (pdfUrl) {
      updateParentItemLink(parentId, pdfUrl);
    }
  } catch (error) {
    Logger.log("Error in PDF generation: " + error.toString());
  }
}

/**
 * Generates a branded PDF summary of the submission
 * PDF includes: school info, schedule details, and teacher cards with file links
 * 
 * PDF DESIGN:
 * - Blue gradient header with white title
 * - Section icons (🏫 School, 📅 Schedule, 👥 Teachers)
 * - Teacher cards with all details and clickable file links
 * - Footer with timestamp and Item ID
 * 
 * @param {Object} schoolData - School information
 * @param {Array} teachers - Array of teacher objects (with fileUrl property if files uploaded)
 * @param {string} parentId - Monday.com parent item ID
 * @param {Folder} mainFolder - Root Google Drive folder
 * @returns {string} URL of the generated PDF file
 */
function generateSubmissionPDF(schoolData, teachers, parentId, mainFolder) {
  try {
    // Get or create the school folder
    const schoolFolder = getOrCreateFolder(mainFolder, schoolData.schoolName);
    
    // Build HTML content for the PDF with inline CSS
    // We use inline CSS because the PDF generator doesn't support external stylesheets
    let htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          /* Reset margins and padding */
          @page {
            margin: 0;
            size: auto;
          }
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          
          /* Main body styling */
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
            background: linear-gradient(135deg, #295EE3 0%, #16367B 100%);
            padding: 40px 20px;
            color: #1f2937;
          }
          
          /* White container for content */
          .container {
            max-width: 800px;
            margin: 0 auto;
            background: white;
            border-radius: 16px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            overflow: hidden;
          }
          
          /* Blue gradient header */
          .header {
            background: linear-gradient(135deg, #16367B 0%, #295EE3 100%);
            color: white;
            padding: 40px;
            text-align: center;
          }
          .header h1 {
            font-size: 32px;
            font-weight: bold;
            margin: 0;
          }
          
          /* Content area */
          .content {
            padding: 40px;
          }
          
          /* Section styling */
          .section {
            margin-bottom: 40px;
            page-break-inside: avoid;  /* Keep sections together */
          }
          .section-header {
            display: flex;
            align-items: center;
            margin-bottom: 24px;
            padding-bottom: 12px;
            border-bottom: 2px solid #e5e7eb;
          }
          
          /* Section icons (🏫, 📅, 👥) */
          .section-icon {
            width: 40px;
            height: 40px;
            background: rgba(22, 54, 123, 0.1);  /* Light blue background */
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-right: 16px;
            color: #16367B;
            font-weight: bold;
          }
          .section-title {
            font-size: 20px;
            font-weight: bold;
            color: #111827;
          }
          
          /* Field layout grid */
          .field-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;  /* Two columns */
            gap: 20px;
            margin-bottom: 20px;
          }
          .field-full {
            grid-column: 1 / -1;  /* Span both columns */
          }
          
          /* Individual field styling */
          .field {
            margin-bottom: 16px;
          }
          .label {
            font-size: 12px;
            font-weight: 600;
            color: #6b7280;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 6px;
            display: block;
          }
          .value {
            color: #1f2937;
            font-size: 14px;
            line-height: 1.6;
            background: #f9fafb;
            padding: 12px;
            border-radius: 8px;
            border: 1px solid #e5e7eb;
          }
          
          /* Teacher card styling */
          .teacher-card {
            border: 2px solid #16367B;
            padding: 24px;
            margin: 20px 0;
            border-radius: 12px;
            background: #f9fafb;
            page-break-inside: avoid;  /* Keep teacher cards together */
          }
          .teacher-header {
            font-size: 18px;
            font-weight: bold;
            color: #16367B;
            margin-bottom: 20px;
            padding-bottom: 12px;
            border-bottom: 2px solid #e5e7eb;
          }
          
          /* Checkbox/badge list (for selected services) */
          .checkbox-list {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-top: 6px;
          }
          .checkbox-item {
            background: white;
            padding: 6px 12px;
            border-radius: 6px;
            border: 1px solid #16367B;
            color: #16367B;
            font-size: 13px;
            font-weight: 500;
          }
          
          /* Footer with metadata */
          .meta {
            background: #f3f4f6;
            padding: 20px;
            margin-top: 40px;
            border-radius: 8px;
            font-size: 12px;
            color: #6b7280;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <!-- Header with title -->
          <div class="header">
            <h1>Partnership Inquiry Response</h1>
          </div>
          
          <div class="content">
            <!-- School Information Section -->
            <div class="section">
              <div class="section-header">
                <div class="section-icon">🏫</div>
                <div class="section-title">School Information</div>
              </div>
              <div class="field-grid">
                <div class="field field-full">
                  <span class="label">Name of School</span>
                  <div class="value">${escapeHtml(schoolData.schoolName)}</div>
                </div>
                <div class="field">
                  <span class="label">Your Full Name</span>
                  <div class="value">${escapeHtml(schoolData.fullName)}</div>
                </div>
                <div class="field">
                  <span class="label">Email Address</span>
                  <div class="value">${escapeHtml(schoolData.email)}</div>
                </div>
                <div class="field field-full">
                  <span class="label">School Address</span>
                  <div class="value">${escapeHtml(schoolData.address)}</div>
                </div>
              </div>
            </div>
            
            <!-- Schedule & Contract Section -->
            <div class="section">
              <div class="section-header">
                <div class="section-icon">📅</div>
                <div class="section-title">Schedule & Contract Details</div>
              </div>
              <div class="field-grid">
                <div class="field">
                  <span class="label">Teacher/Instructional Days</span>
                  <div class="value">${escapeHtml(schoolData.teacherDays)}</div>
                </div>
                <div class="field field-full">
                  <span class="label">Duties, Meetings, & PD</span>
                  <div class="value">${escapeHtml(schoolData.duties)}</div>
                </div>
                <div class="field field-full">
                  <span class="label">Salary & Benefits</span>
                  <div class="value">${escapeHtml(schoolData.salary)}</div>
                </div>
                ${schoolData.additionalInfo ? '<div class="field field-full"><span class="label">Should we know anything else?</span><div class="value">' + escapeHtml(schoolData.additionalInfo) + '</div></div>' : ''}
              </div>
            </div>
            
            <!-- Teachers Section -->
            <div class="section">
              <div class="section-header">
                <div class="section-icon">👥</div>
                <div class="section-title">Number of Teachers (${schoolData.numberOfTeachers})</div>
              </div>
    `;
    
    // Add teacher details (each teacher gets a card)
    if (teachers.length > 0) {
      teachers.forEach((teacher, index) => {
        htmlContent += `
          <div class="teacher-card">
            <div class="teacher-header">${escapeHtml(teacher.name)}</div>
            <div class="field-grid">
              ${teacher.description ? '<div class="field field-full"><span class="label">Description</span><div class="value">' + escapeHtml(teacher.description) + '</div></div>' : ''}
              ${teacher.teachingSchedule ? '<div class="field field-full"><span class="label">Teaching Schedule</span><div class="value">' + escapeHtml(teacher.teachingSchedule) + '</div></div>' : ''}
              ${teacher.startDate ? '<div class="field"><span class="label">Desired Start Date</span><div class="value">' + escapeHtml(teacher.startDate) + '</div></div>' : ''}
              ${teacher.lastDay ? '<div class="field"><span class="label">Last Day of Instruction</span><div class="value">' + escapeHtml(teacher.lastDay) + '</div></div>' : ''}
              ${teacher.certification ? '<div class="field"><span class="label">Certification</span><div class="value">' + escapeHtml(teacher.certification) + '</div></div>' : ''}
              ${teacher.modality ? '<div class="field"><span class="label">Modality Preference</span><div class="value">' + escapeHtml(teacher.modality) + '</div></div>' : ''}
              ${teacher.gradeLevels && teacher.gradeLevels.length > 0 ? '<div class="field field-full"><span class="label">Grade Level(s)</span><div class="checkbox-list">' + teacher.gradeLevels.map(g => '<span class="checkbox-item">' + escapeHtml(g) + '</span>').join('') + '</div></div>' : ''}
              ${teacher.llnServices && teacher.llnServices.length > 0 ? '<div class="field field-full"><span class="label">LLN Services</span><div class="checkbox-list">' + teacher.llnServices.map(s => '<span class="checkbox-item">' + escapeHtml(s) + '</span>').join('') + '</div></div>' : ''}
              ${teacher.languages && teacher.languages.length > 0 ? '<div class="field field-full"><span class="label">Language(s)</span><div class="checkbox-list">' + teacher.languages.map(l => '<span class="checkbox-item">' + escapeHtml(l) + '</span>').join('') + '</div></div>' : ''}
              ${teacher.regServices && teacher.regServices.length > 0 ? '<div class="field field-full"><span class="label">REG Services (English)</span><div class="checkbox-list">' + teacher.regServices.map(r => '<span class="checkbox-item">' + escapeHtml(r) + '</span>').join('') + '</div></div>' : ''}
              ${teacher.fileUrl && teacher.fileName ? '<div class="field field-full"><span class="label">Attached File</span><div class="value"><a href="' + teacher.fileUrl + '" target="_blank" style="color: #16367B; text-decoration: underline;">📎 ' + escapeHtml(teacher.fileName) + '</a></div></div>' : ''}
            </div>
          </div>
        `;
      });
    } else {
      // If no teachers (TBD mode), just show the number/description
      htmlContent += `<div class="value">${escapeHtml(schoolData.numberOfTeachers)}</div>`;
    }
    
    // Close the HTML and add footer
    htmlContent += `
            </div>
          </div>
          
          <!-- Footer with submission metadata -->
          <div class="meta">
            Submitted on ${new Date().toLocaleString()} • Item ID: ${parentId}
          </div>
        </div>
      </body>
      </html>
    `;
    
    // Convert HTML to PDF
    const blob = Utilities.newBlob(htmlContent, 'text/html', 'temp.html');
    const pdfBlob = blob.getAs('application/pdf');
    pdfBlob.setName(`${schoolData.schoolName} - Submission - ${parentId}.pdf`);
    
    // Upload to school folder
    const pdfFile = schoolFolder.createFile(pdfBlob);
    
    // Inherit permissions from main folder
    inheritFilePermissions(pdfFile, mainFolder);
    
    Logger.log("PDF created successfully: " + pdfFile.getUrl());
    return pdfFile.getUrl();
    
  } catch (error) {
    Logger.log("Error generating PDF: " + error.toString());
    throw error;
  }
}

/**
 * Escapes HTML special characters to prevent XSS in PDF
 * Required for any user input that goes into the PDF
 * 
 * @param {string} text - Text to escape
 * @returns {string} HTML-safe text
 */
function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Updates the parent item with the PDF link
 * Tries multiple link formats to ensure Monday.com accepts it
 * If all formats fail, adds the link as a comment
 * 
 * @param {string} parentId - Parent item ID to update
 * @param {string} pdfUrl - URL of the generated PDF
 */
function updateParentItemLink(parentId, pdfUrl) {
  const config = getConfig();

  // Try different link formats
  const linkFormats = [
    JSON.stringify({ url: pdfUrl, text: "View Submission PDF" }),
    JSON.stringify(JSON.stringify({ url: pdfUrl, text: "View Submission PDF" })),
    JSON.stringify(pdfUrl)
  ];

  // Try each format
  for (let i = 0; i < linkFormats.length; i++) {
    try {
      const query = `
        mutation {
          change_column_value (
            board_id: ${config.boardId},
            item_id: ${parentId},
            column_id: "wf_edit_link_wdlng",
            value: ${linkFormats[i]}
          ) {
            id
          }
        }
      `;

      const response = callMondayAPI(query);
      
      if (!response.errors) {
        Logger.log(`PDF link format ${i + 1} worked for parent item ${parentId}`);
        return;
      }
    } catch (e) {
      Logger.log(`PDF link format ${i + 1} failed: ${e.toString()}`);
    }
  }
  
  // If all formats failed, add as a comment
  Logger.log("All PDF link formats failed, adding as comment");
  createItemUpdate(parentId, `PDF submission: <a href="${pdfUrl}" target="_blank">View PDF</a>`);
}
