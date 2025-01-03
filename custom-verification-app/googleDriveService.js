const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

async function uploadFileToDrive(filePath, mimeType, folderId) {
  // Auth setup
  const auth = new google.auth.GoogleAuth({
    keyFile: '/etc/secrets/GOOGLE_API_KEY_FILE',
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  const driveService = google.drive({ version: 'v3', auth });

  // Prepare file metadata
  const fileMetaData = {
    name: path.basename(filePath), 
    // "parents" is how we specify the folder(s)
    parents: [folderId], 
  };

  const media = {
    mimeType,
    body: fs.createReadStream(filePath),
  };

  // Create the file in Drive
  const file = await driveService.files.create({
    requestBody: fileMetaData,
    media,
    fields: 'id, webViewLink, webContentLink',
  });

  const fileId = file.data.id;

  // Optional: set permissions so anyone with the link can view
  await driveService.permissions.create({
    fileId,
    requestBody: {
      role: 'reader',
      type: 'anyone',
    },
  });

  // Get the final web links
  const updatedFile = await driveService.files.get({
    fileId,
    fields: 'webViewLink, webContentLink',
  });

  return {
    fileId,
    webViewLink: updatedFile.data.webViewLink,
    webContentLink: updatedFile.data.webContentLink,
  };
}

module.exports = { uploadFileToDrive };