/**
 * ========================================================================
 * KREYCO PARTNERSHIP INQUIRY FORM - BACKEND (Google Apps Script)
 * ========================================================================
 * * PURPOSE:
 * This script handles form submissions from the web interface and creates
 * structured data in Monday.com with automated file management in Google Drive.
 * * SETUP INSTRUCTIONS:
 * 1. Go to Project Settings (gear icon) > Script Properties
 * 2. Add these properties:
 * - MONDAY_API_KEY = your Monday.com API token
 * - MONDAY_BOARD_ID = your board ID (e.g., 6938836032)
 * - DRIVE_FOLDER_ID = your Google Drive folder ID for file uploads
 * - EMAIL_FROM = sender email address (e.g., noreply@kreyco.com)
 * - EMAIL_RECIPIENTS = comma-separated recipient emails (e.g., admin@kreyco.com,team@kreyco.com)
 * 3. Enable Drive API: Services > + Add a service > Drive API
 * 4. Deploy as Web App: Deploy > New deployment > Web app
 * * @version 2.8 (Added Instructional Days Calculation)
 * @date 2025-01-08
 */

// ========================================================================
// SECTION 1: WEB APP INITIALIZATION & UTILITIES
// ========================================================================

/**
 * Serves the HTML interface to users
 * This function runs when someone visits the deployed web app URL
 */
function doGet(e) {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Kreyco Partnership Inquiry Form')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Helper function to include external HTML files
 * Usage in HTML: <?!= include('JavaScript'); ?>
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Retrieves configuration from Script Properties
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
 * Fetches dropdown and status column options from Monday.com (parent + subitem boards)
 */
function getBoardDropdownOptions() {
  const config = getConfig();
  
  if (!config.boardId) {
    throw new Error("MONDAY_BOARD_ID not configured in Script Properties");
  }

  // Parent board columns
  const parentQuery = `
    query {
      boards (ids: ${config.boardId}) {
        columns (ids: [
          "dropdown_mkt67ese",  # Language acquisition
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

  // Subitem board columns (Humanities, STEM, SPED, Para are on subitems)
  const subitemQuery = `
    query {
      boards (ids: ${config.boardId}) {
        items_page (limit: 1) {
          items {
            subitems {
              board {
                columns (ids: [
                  "dropdown_mkzc6dgm",  # Grade Levels
                  "dropdown_mm02xrpn",  # Humanities
                  "dropdown_mm02azn5",  # STEM
                  "dropdown_mm02m53x",  # SPED
                  "dropdown_mm02v870",  # Paraprofessional support
                  "dropdown_mkzcbcq4"   # Languages
                ]) {
                  id
                  title
                  type
                  settings_str
                }
              }
            }
          }
        }
      }
    }
  `;

  const options = {};

  // Fetch parent board options
  const parentResponse = callMondayAPI(parentQuery);
  if (parentResponse.data && parentResponse.data.boards && parentResponse.data.boards.length > 0) {
    const columns = parentResponse.data.boards[0].columns;
    processColumns(columns, options);
  }

  // Fetch subitem board options
  const subitemResponse = callMondayAPI(subitemQuery);
  try {
    const items = subitemResponse.data.boards[0].items_page.items;
    if (items && items.length > 0 && items[0].subitems && items[0].subitems.length > 0) {
      const subitemColumns = items[0].subitems[0].board.columns;
      processColumns(subitemColumns, options);
    }
  } catch (e) {
    Logger.log("Could not fetch subitem columns (may not have any subitems yet): " + e.toString());
  }

  return options;
}

/**
 * Processes column settings into options map
 */
function processColumns(columns, options) {
  columns.forEach(column => {
    try {
      const settings = JSON.parse(column.settings_str);
      
      if (column.type === 'dropdown' && settings.labels) {
        options[column.id] = {
          title: column.title,
          type: column.type,
          labels: settings.labels.map(label => ({ name: label.name }))
        };
      } 
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
}

/**
 * Makes API calls to Monday.com using GraphQL
 */
function callMondayAPI(query) {
  const config = getConfig();
  
  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'Authorization': config.apiKey
    },
    payload: JSON.stringify({ query: query }),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch('https://api.monday.com/v2', options);
  return JSON.parse(response.getContentText());
}

/**
 * Escapes special characters for GraphQL queries
 */
function escapeGql(str) {
  if (!str) return '';
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

/**
 * HELPER: Updates a generic column value
 * Automatically handles JSON stringification for both Text and Link columns
 */
function updateMondayColumn(itemId, columnId, value) {
  const config = getConfig();
  let valueStr;
  
  // Logic: 
  // If 'value' is an object (for Link columns or Long Text), we must double-stringify it.
  // If 'value' is a simple string (for Text columns), we single-stringify it.
  
  if (typeof value === 'object') {
    valueStr = JSON.stringify(JSON.stringify(value));
  } else {
    // Force to string to be safe, then stringify to add quotes for GraphQL
    valueStr = JSON.stringify(String(value));
  }

  const query = `
    mutation {
      change_column_value (
        board_id: ${config.boardId},
        item_id: ${itemId},
        column_id: "${columnId}",
        value: ${valueStr}
      ) {
        id
      }
    }
  `;

  return callMondayAPI(query);
}

// ========================================================================
// SECTION 3: MAIN SUBMISSION PROCESSING
// ========================================================================

/**
 * Main entry point for form submissions
 */
function processApplication(data) {
  try {
    const config = getConfig();
    const submissionDate = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    
    // STEP 1: Create the parent item
    Logger.log("Creating parent item...");
    const parentId = createParentItem(data.schoolData);
    Logger.log(`Parent item created with ID: ${parentId}`);
    
    // Initialize URL variables
    let calendarUrl = null;
    let bellUrl = null;

    // STEP 2: Upload school calendar and Update Monday Column
    // Column ID: long_text_mkzw9xs4 (Long Text)
    if (data.schoolData.calendarText) {
        // Text provided directly
        Logger.log("Updating School Calendar Text Column...");
        updateMondayColumn(parentId, "long_text_mkzw9xs4", { text: data.schoolData.calendarText });
        calendarUrl = null; 
    } else if (data.schoolData.calendarFileData && data.schoolData.calendarFileName) {
      try {
        Logger.log("Uploading school calendar...");
        const mainFolder = config.driveFolderId ? DriveApp.getFolderById(config.driveFolderId) : null;
        if (mainFolder) {
          calendarUrl = uploadSchoolCalendar(data.schoolData, parentId, mainFolder, submissionDate);
          
          if (calendarUrl) {
            Logger.log(`Updating School Calendar Text Column with Link (${calendarUrl})...`);
            // Update Monday.com "long_text_mkzw9xs4" with "File: <URL>"
            updateMondayColumn(parentId, "long_text_mkzw9xs4", { text: `File: ${calendarUrl}` });
          }
        }
      } catch (calendarError) {
        Logger.log("Error uploading school calendar: " + calendarError.toString());
      }
    }
    
    // STEP 2.5: Upload bell schedule and Update Monday Column
    // Column ID: long_text_mkzwd7xp (Long Text)
    if (data.schoolData.bellScheduleText) {
         // Text provided directly
        Logger.log("Updating Bell Schedule Text Column...");
        updateMondayColumn(parentId, "long_text_mkzwd7xp", { text: data.schoolData.bellScheduleText });
        bellUrl = null;
    } else if (data.schoolData.bellScheduleFileData && data.schoolData.bellScheduleFileName) {
      try {
        Logger.log("Uploading bell schedule...");
        const mainFolder = config.driveFolderId ? DriveApp.getFolderById(config.driveFolderId) : null;
        if (mainFolder) {
          bellUrl = uploadBellSchedule(data.schoolData, parentId, mainFolder, submissionDate);
          
          if (bellUrl) {
            Logger.log("Updating Bell Schedule Text Column with Link...");
            // Update Monday.com "long_text_mkzwd7xp" with "File: <URL>"
            updateMondayColumn(parentId, "long_text_mkzwd7xp", { text: `File: ${bellUrl}` });
          }
        }
      } catch (bellScheduleError) {
        Logger.log("Error uploading bell schedule: " + bellScheduleError.toString());
      }
    }
    
    // STEP 3: Process teacher subitems
    let teachersWithFiles = data.teachers || [];
    if (data.teachers && data.teachers.length > 0) {
      Logger.log(`Processing ${data.teachers.length} teacher(s)...`);
      
      /* Certification is now global and mapped to parent. No need to copy to teachers.
      teachersWithFiles.forEach(teacher => {
        if (data.schoolData.certification) {
          teacher.certification = data.schoolData.certification;
        }
      });
      */

      const mainFolder = config.driveFolderId ? DriveApp.getFolderById(config.driveFolderId) : null;
      teachersWithFiles = processTeachers(teachersWithFiles, parentId, mainFolder, data.schoolData.schoolName, submissionDate);
    }
    
    // EXECUTE FINAL TASKS (PDF & Email) - Synchronous
    Logger.log("Executing final tasks (PDF & Email)...");
    
    const completionData = {
      teachers: teachersWithFiles,
      schoolData: {
        ...data.schoolData,
        calendarUrl: calendarUrl,
        bellUrl: bellUrl
      },
      parentId: parentId,
      submissionDate: submissionDate
    };
    
    // Generate PDF
    const mainFolder = config.driveFolderId ? DriveApp.getFolderById(config.driveFolderId) : null;
    if (mainFolder) {
      try {
        generateAndUploadPDF(completionData, parentId, mainFolder, submissionDate);
      } catch (pdfError) {
        Logger.log("PDF generation error: " + pdfError.toString());
      }
    }

    // Send Email
    try {
      const mondayUrl = getMondayItemUrl(parentId);
      sendEmailNotification(completionData.schoolData, teachersWithFiles, parentId, mondayUrl, submissionDate);
    } catch (emailError) {
      Logger.log("Email error: " + emailError.toString());
    }
    
    return { success: true, message: "Response submitted successfully!" };

  } catch (error) {
    Logger.log("Error processing response: " + error.toString());
    Logger.log("Error stack: " + error.stack);
    return { success: false, message: "Error: " + error.toString() };
  }
}



/**
 * Creates the parent item in Monday.com
 */
function createParentItem(schoolData) {
  const config = getConfig();
  
  const columnValues = {
    "text6__1": schoolData.address,
    "text__1": schoolData.fullName,
    "text5__1": schoolData.email,
    "text_mkzc61ta": schoolData.phone,
    "long_text7__1": schoolData.additionalInfo,
    "text06__1": schoolData.numberOfTeachers, // Reverted to text06__1
    "color_mksnhewa": { label: schoolData.certification } // Added Global Certification mapping
  };

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
  
  if (response.errors) {
    throw new Error("Monday API Error (Create Parent): " + JSON.stringify(response.errors));
  }
  
  return response.data.create_item.id;
}

/**
 * Uploads school calendar to Drive
 */
function uploadSchoolCalendar(schoolData, parentId, mainFolder, submissionDate) {
  try {
    const schoolFolder = getOrCreateFolder(mainFolder, schoolData.schoolName);
    const dateFolder = getOrCreateFolder(schoolFolder, submissionDate);
    const newFileName = `School Calendar File - ${schoolData.calendarFileName}`;
    
    const blob = Utilities.newBlob(
      Utilities.base64Decode(schoolData.calendarFileData),
      schoolData.calendarMimeType,
      newFileName
    );
    
    const file = dateFolder.createFile(blob);
    inheritFilePermissions(file, mainFolder);
    return file.getUrl();
    
  } catch (error) {
    Logger.log("Error uploading school calendar: " + error.toString());
    throw error;
  }
}

/**
 * Uploads bell schedule to Drive
 */
function uploadBellSchedule(schoolData, parentId, mainFolder, submissionDate) {
  try {
    const schoolFolder = getOrCreateFolder(mainFolder, schoolData.schoolName);
    const dateFolder = getOrCreateFolder(schoolFolder, submissionDate);
    const newFileName = `Bell Schedule File - ${schoolData.bellScheduleFileName}`;
    
    const blob = Utilities.newBlob(
      Utilities.base64Decode(schoolData.bellScheduleFileData),
      schoolData.bellScheduleMimeType,
      newFileName
    );
    
    const file = dateFolder.createFile(blob);
    inheritFilePermissions(file, mainFolder);
    return file.getUrl();
    
  } catch (error) {
    Logger.log("Error uploading bell schedule: " + error.toString());
    throw error;
  }
}

/**
 * Uploads teacher schedule to Drive
 */
function uploadTeacherSchedule(teacher, schoolName, mainFolder, submissionDate) {
  try {
    const schoolFolder = getOrCreateFolder(mainFolder, schoolName);
    const dateFolder = getOrCreateFolder(schoolFolder, submissionDate);
    const newFileName = `${teacher.name} - Schedule - ${teacher.teachingScheduleFileName}`;
    
    const blob = Utilities.newBlob(
      Utilities.base64Decode(teacher.teachingScheduleFileData),
      teacher.teachingScheduleMimeType,
      newFileName
    );
    
    const file = dateFolder.createFile(blob);
    inheritFilePermissions(file, mainFolder);
    return file.getUrl();
    
  } catch (error) {
    Logger.log("Error uploading teacher schedule: " + error.toString());
    throw error;
  }
}

/**
 * Processes teacher subitems
 */
function processTeachers(teachers, parentId, mainFolder, schoolName, submissionDate) {
  teachers.forEach((teacher) => {
    try {
      // Handle file upload for teacher schedule
      if (teacher.teachingScheduleFileData && teacher.teachingScheduleFileName && mainFolder) {
        try {
          const fileUrl = uploadTeacherSchedule(teacher, schoolName, mainFolder, submissionDate);
          if (fileUrl) {
            if (teacher.teachingSchedule) {
              teacher.teachingSchedule += `\n\nFile: ${fileUrl}`;
            } else {
              teacher.teachingSchedule = `File: ${fileUrl}`;
            }
          }
        } catch (uploadErr) {
          Logger.log("Error uploading teacher file: " + uploadErr);
        }
      }

      createSubitem(parentId, teacher);
    } catch (e) {
      Logger.log("Error creating subitem " + teacher.name + ": " + e.toString());
    }
  });
  return teachers;
}

/**
 * Creates a subitem (teacher) in Monday.com
 */
function createSubitem(parentId, teacher) {
  const columnValues = {
    "long_text_mkzb794g": teacher.description || "",
    "text_mkzcyvvk": teacher.teachingSchedule || "",
    "long_text_mkzc84xz": teacher.duties || "",
    "long_text_mkzhdnv7": teacher.annualSalary || "",
    "long_text_mkzhk5pv": teacher.proratedSalary || "",
    "text_mkzc34ak": teacher.startDate || "",
    "text_mkzce7mc": teacher.lastDay || "",
    "text_mkzdenv2": teacher.instructionalDays || "", // Instructional Days
    "long_text_mm02phkt": teacher.campusName || "", // Campus Name
    "long_text_mm026ebf": teacher.campusAddress || "" // Campus Address
  };

  if (teacher.gradeLevels && teacher.gradeLevels.length > 0) {
    columnValues["dropdown_mkzc6dgm"] = { labels: teacher.gradeLevels };
  }
  if (teacher.llnServices && teacher.llnServices.length > 0) {
    columnValues["dropdown_mkzcq8h6"] = { labels: teacher.llnServices };
  }

  if (teacher.humanities && teacher.humanities.length > 0) {
    columnValues["dropdown_mm02xrpn"] = { labels: teacher.humanities };
  }
  if (teacher.stem && teacher.stem.length > 0) {
    columnValues["dropdown_mm02azn5"] = { labels: teacher.stem };
  }
  if (teacher.sped && teacher.sped.length > 0) {
    columnValues["dropdown_mm02m53x"] = { labels: teacher.sped };
  }
  if (teacher.paraprofessional && teacher.paraprofessional.length > 0) {
    columnValues["dropdown_mm02v870"] = { labels: teacher.paraprofessional };
  }
  if (teacher.languages && teacher.languages.length > 0) {
    columnValues["dropdown_mkzcbcq4"] = { labels: teacher.languages };
  }

  if (teacher.certification) {
    columnValues["color_mkzcwqdn"] = { label: teacher.certification };
  }
  if (teacher.modality) {
    columnValues["color_mkzcn0h2"] = { label: teacher.modality };
  }

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
 * Creates a comment update
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

function getOrCreateFolder(parentFolder, folderName) {
  const folders = parentFolder.getFoldersByName(folderName);
  if (folders.hasNext()) {
    return folders.next();
  }
  return parentFolder.createFolder(folderName);
}

function inheritFilePermissions(targetFile, sourceFolder) {
  try {
    const viewers = sourceFolder.getViewers();
    viewers.forEach(viewer => targetFile.addViewer(viewer.getEmail()));
    
    const editors = sourceFolder.getEditors();
    editors.forEach(editor => targetFile.addEditor(editor.getEmail()));
  } catch (e) {
    Logger.log("Error inheriting file permissions: " + e.toString());
  }
}

// ========================================================================
// SECTION 5: PDF GENERATION & EMAIL
// ========================================================================

function generateAndUploadPDF(data, parentId, mainFolder, submissionDate) {
  try {
    const pdfUrl = generateSubmissionPDF(data.schoolData, data.teachers, parentId, mainFolder, submissionDate);
    if (pdfUrl) {
      updateParentItemLink(parentId, pdfUrl);
    }
  } catch (error) {
    Logger.log("Error in PDF generation: " + error.toString());
  }
}

function generateSubmissionPDF(schoolData, teachers, parentId, mainFolder, submissionDate) {
  const schoolFolder = getOrCreateFolder(mainFolder, schoolData.schoolName);
  const dateFolder = getOrCreateFolder(schoolFolder, submissionDate);
  
  // Fetch and encode logo to Base64 to ensure it renders in PDF
  let logoBase64 = '';
  try {
    const logoUrl = "https://kreyco.s3.us-east-2.amazonaws.com/kreyco-logo.png";
    const logoBlob = UrlFetchApp.fetch(logoUrl).getBlob();
    logoBase64 = "data:image/png;base64," + Utilities.base64Encode(logoBlob.getBytes());
  } catch (e) {
    Logger.log("Error fetching logo for PDF: " + e.toString());
    // Fallback if fetch fails (optional, or just leave empty)
  }

  // Updated HTML Content with Kreyco Branding and Fixed Layout
  let htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        @page { margin: 40px; size: letter; }
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background: #ffffff; color: #1f2937; line-height: 1.5; }
        .container { max-width: 100%; margin: 0 auto; }
        
        .header { 
          text-align: center; 
          margin-bottom: 40px; 
          padding-bottom: 20px; 
          border-bottom: 2px solid #f3f4f6; 
        }
        .logo { height: 60px; margin-bottom: 15px; }
        h1 { color: #16367B; margin: 0; font-size: 24px; font-weight: 700; }
        
        .section { margin-bottom: 30px; }
        .section-title { 
          color: #16367B; 
          font-size: 18px; 
          font-weight: 600; 
          border-bottom: 1px solid #e5e7eb; 
          padding-bottom: 10px; 
          margin-bottom: 15px; 
        }
        
        .grid { display: table; width: 100%; border-spacing: 0 10px; }
        .row { display: table-row; }
        .label { display: table-cell; font-weight: 600; color: #4b5563; width: 140px; padding: 4px 0; vertical-align: top; }
        .value { display: table-cell; color: #111827; padding: 4px 0; vertical-align: top; }
        .value a { color: #16367B; text-decoration: none; }
        
        .teacher-card { 
          border: 1px solid #e5e7eb; 
          padding: 20px; 
          margin-bottom: 20px; 
          border-radius: 12px; 
          background: #f9fafb; 
          page-break-inside: avoid; 
          break-inside: avoid; 
        }
        .teacher-header { 
          font-weight: 700; 
          color: #16367B; 
          font-size: 16px; 
          padding-bottom: 10px; 
          margin-bottom: 10px; 
          border-bottom: 1px solid #e5e7eb; 
        }
        .teacher-row { margin-bottom: 8px; }
        .t-label { font-weight: 600; color: #4b5563; font-size: 0.9em; display: inline-block; width: 130px; vertical-align: top; }
        .t-value { display: inline-block; color: #1f2937; width: calc(100% - 135px); vertical-align: top; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          ${logoBase64 ? `<img src="${logoBase64}" class="logo" alt="Kreyco">` : ''}
          <h1>Partnership Inquiry Response</h1>
        </div>
        
        <div class="section">
          <div class="section-title">School Information</div>
          <div class="grid">
            <div class="row"><div class="label">School Name</div><div class="value">${escapeHtml(schoolData.schoolName)}</div></div>
            <div class="row"><div class="label">Address</div><div class="value">${escapeHtml(schoolData.address)}</div></div>
            <div class="row"><div class="label">Contact</div><div class="value">${escapeHtml(schoolData.fullName)}</div></div>
            <div class="row"><div class="label">Email</div><div class="value">${escapeHtml(schoolData.email)}</div></div>
            <div class="row"><div class="label">Phone</div><div class="value">${escapeHtml(schoolData.phone)}</div></div>
            <div class="row"><div class="label">School Calendar</div><div class="value">${schoolData.calendarText ? escapeHtml(schoolData.calendarText) : (schoolData.calendarUrl ? `<a href="${schoolData.calendarUrl}" target="_blank">View File</a>` : 'Not provided')}</div></div>
            <div class="row"><div class="label">Bell Schedule</div><div class="value">${schoolData.bellScheduleText ? escapeHtml(schoolData.bellScheduleText) : (schoolData.bellUrl ? `<a href="${schoolData.bellUrl}" target="_blank">View File</a>` : 'Not provided')}</div></div>
            <div class="row"><div class="label">Additional Info</div><div class="value">${escapeHtml(schoolData.additionalInfo || 'None provided')}</div></div>
          </div>
        </div>

        <div class="section">
  `;

  // Dynamic Content for Teachers Section
  let teacherSectionTitle = 'Teachers';
  let teacherSectionContent = '';

  if (teachers.length > 0) {
    teacherSectionTitle += ` (${teachers.length})`;
    teachers.forEach(teacher => {
      teacherSectionContent += `
        <div class="teacher-card">
          <div class="teacher-header">${escapeHtml(teacher.name)}</div>
          ${teacher.campusName ? `<div class="teacher-row"><span class="t-label">Campus Name</span><span class="t-value">${escapeHtml(teacher.campusName)}</span></div>` : ''}
          ${teacher.campusAddress ? `<div class="teacher-row"><span class="t-label">Campus Address</span><span class="t-value">${escapeHtml(teacher.campusAddress)}</span></div>` : ''}
          ${teacher.description ? `<div class="teacher-row"><span class="t-label">Description</span><span class="t-value">${escapeHtml(teacher.description)}</span></div>` : ''}
          ${teacher.duties ? `<div class="teacher-row"><span class="t-label">Duties</span><span class="t-value">${escapeHtml(teacher.duties)}</span></div>` : ''}
          ${teacher.gradeLevels && teacher.gradeLevels.length > 0 ? `<div class="teacher-row"><span class="t-label">Grades</span><span class="t-value">${escapeHtml(teacher.gradeLevels.join(', '))}</span></div>` : ''}
          ${teacher.languages && teacher.languages.length > 0 ? `<div class="teacher-row"><span class="t-label">Languages</span><span class="t-value">${escapeHtml(teacher.languages.join(', '))}</span></div>` : ''}
          ${teacher.llnServices && teacher.llnServices.length > 0 ? `<div class="teacher-row"><span class="t-label">Language Acquisition</span><span class="t-value">${escapeHtml(teacher.llnServices.join(', '))}</span></div>` : ''}
          ${teacher.humanities && teacher.humanities.length > 0 ? `<div class="teacher-row"><span class="t-label">Humanities</span><span class="t-value">${escapeHtml(teacher.humanities.join(', '))}</span></div>` : ''}
          ${teacher.stem && teacher.stem.length > 0 ? `<div class="teacher-row"><span class="t-label">STEM</span><span class="t-value">${escapeHtml(teacher.stem.join(', '))}</span></div>` : ''}
          ${teacher.sped && teacher.sped.length > 0 ? `<div class="teacher-row"><span class="t-label">SPED</span><span class="t-value">${escapeHtml(teacher.sped.join(', '))}</span></div>` : ''}
          ${teacher.para && teacher.para.length > 0 ? `<div class="teacher-row"><span class="t-label">Paraprofessional Support</span><span class="t-value">${escapeHtml(teacher.para.join(', '))}</span></div>` : ''}
          ${teacher.certification ? `<div class="teacher-row"><span class="t-label">Certification</span><span class="t-value">${escapeHtml(teacher.certification)}</span></div>` : ''}
          ${teacher.modality ? `<div class="teacher-row"><span class="t-label">Modality</span><span class="t-value">${escapeHtml(teacher.modality)}</span></div>` : ''}
          ${teacher.teachingSchedule ? `<div class="teacher-row"><span class="t-label">Schedule</span><span class="t-value">${escapeHtml(teacher.teachingSchedule)}</span></div>` : ''}
          ${teacher.annualSalary ? `<div class="teacher-row"><span class="t-label">Annual Salary & Benefits</span><span class="t-value">${escapeHtml(teacher.annualSalary)}</span></div>` : ''}
          ${teacher.proratedSalary ? `<div class="teacher-row"><span class="t-label">Prorated Salary & Benefits</span><span class="t-value">${escapeHtml(teacher.proratedSalary)}</span></div>` : ''}
          ${teacher.startDate ? `<div class="teacher-row"><span class="t-label">Start Date</span><span class="t-value">${escapeHtml(teacher.startDate)}</span></div>` : ''}
          ${teacher.lastDay ? `<div class="teacher-row"><span class="t-label">End Date</span><span class="t-value">${escapeHtml(teacher.lastDay)}</span></div>` : ''}
          ${teacher.instructionalDays ? `<div class="teacher-row"><span class="t-label">Instructional Days</span><span class="t-value">${escapeHtml(teacher.instructionalDays)}</span></div>` : ''}
        </div>`;
    });
  } else {
    // TBD Mode: numberOfTeachers holds the description text
    const tbdDescription = schoolData.numberOfTeachers || 'No specific teacher details provided (TBD Mode).';
    teacherSectionContent = `
      <div class="value" style="background: #f9fafb; padding: 20px; border-radius: 12px; border: 1px solid #e5e7eb; font-style: italic; color: #4b5563;">
        ${escapeHtml(tbdDescription)}
      </div>`;
  }

  htmlContent += `
           <div class="section-title">${teacherSectionTitle}</div>
           ${teacherSectionContent}
        </div>

        <div style="margin-top: 30px; font-size: 0.8em; color: #999; text-align: center;">
          Submitted: ${new Date().toLocaleString()} | ID: ${parentId}
        </div>
      </div>
    </body>
    </html>
  `;
  
  const blob = Utilities.newBlob(htmlContent, 'text/html', 'temp.html');
  const pdfBlob = blob.getAs('application/pdf');
  pdfBlob.setName(`${schoolData.schoolName} - Submission - ${parentId}.pdf`);
  
  const pdfFile = dateFolder.createFile(pdfBlob);
  inheritFilePermissions(pdfFile, mainFolder);
  return pdfFile.getUrl();
}

function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function updateParentItemLink(parentId, pdfUrl) {
  try {
    // Use the helper function which handles proper stringification
    const response = updateMondayColumn(parentId, "wf_edit_link_wdlng", { url: pdfUrl, text: "View Submission PDF" });
    
    if (response.errors) {
       Logger.log("Error updating PDF link column: " + JSON.stringify(response.errors));
       createItemUpdate(parentId, `PDF Link: ${pdfUrl}`);
    }
  } catch (e) {
    Logger.log("Exception updating PDF link column: " + e.toString());
    createItemUpdate(parentId, `PDF Link: ${pdfUrl}`);
  }
}

function getMondayItemUrl(itemId) {
  const config = getConfig();
  return `https://langlearningnetwork.monday.com/boards/${config.boardId}/pulses/${itemId}`;
}

function sendEmailNotification(schoolData, teachers, itemId, mondayUrl, submissionDate) {
  const config = getConfig();
  const emailFrom = PropertiesService.getScriptProperties().getProperty('EMAIL_FROM');
  const emailRecipients = PropertiesService.getScriptProperties().getProperty('EMAIL_RECIPIENTS');
  
  if (!emailFrom || !emailRecipients) return;
  
  const subject = `${schoolData.schoolName} - Quote Form Response`;
  
  try {
    const htmlTemplate = HtmlService.createTemplateFromFile('EmailTemplate');
    htmlTemplate.schoolData = schoolData;
    htmlTemplate.teachers = teachers || [];
    htmlTemplate.itemId = itemId;
    htmlTemplate.mondayUrl = mondayUrl;
    htmlTemplate.submissionDate = submissionDate;
    
    const htmlBody = htmlTemplate.evaluate().getContent();
    
    MailApp.sendEmail({
      to: emailRecipients,
      subject: subject,
      htmlBody: htmlBody,
      name: 'Kreyco Partnership Inquiry',
      replyTo: schoolData.email
    });
  } catch (e) {
    Logger.log("Error sending email: " + e.toString());
  }
}
