const express = require('express');
const fs = require('fs');
const path = require('path');
const basicAuth = require('express-basic-auth');
const multer = require('multer');
const app = express();

app.use(express.json()); // for parsing application/json

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = '/app/data/u';
    // Create uploads directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Generate random 3-character name
    const randomName = Math.random().toString(36).substring(2, 5);
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, randomName + ext);
  }
});

const upload = multer({
  storage: storage,
  fileFilter: function (req, file, cb) {
    const allowedTypes = ['.png', '.jpg', '.jpeg', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only PNG, JPG, JPEG, and WEBP files are allowed'));
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Separate multer instance for general file uploads (no restrictions)
const uploadGeneral = multer({
  storage: multer.diskStorage({
    destination: function (req, file, cb) {
      const subPath = req.body.path || '';
      const uploadDir = path.join('/app/data', subPath);
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
      cb(null, file.originalname);
    }
  }),
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit for general files
  }
});

// Basic auth middleware for protected routes
const auth = basicAuth({
  users: { 
    [process.env.ADMIN_USERNAME || 'admin']: process.env.ADMIN_PASSWORD || 'password123'
  },
  challenge: true,
  realm: 'JSON Editor'
});

const defaultDataDir = '/app/data';

// Helper function to resolve file path
function resolveFilePath(filePath) {
  if (!filePath) return null;
  // If path already starts with /app/data, use it as is
  if (filePath.startsWith('/app/data')) {
    return filePath;
  }
  // Otherwise, prepend /app/data
  return path.join(defaultDataDir, filePath);
}

app.get('/', auth, (req, res) => {
  const subPath = req.query.path || '';
  const directoryPath = path.join('/app/data', subPath);
  
  fs.readdir(directoryPath, (err, files) => {
    if (err) {
      return res.status(500).send('Error reading directory: ' + err.message);
    }
    
    // Read the HTML template
    const templatePath = path.join(__dirname, 'views', 'file-list.html');
    let html = fs.readFileSync(templatePath, 'utf8');
    
    // Generate file list HTML with folder/file differentiation
    let fileListHtml = '';
    
    // Add parent directory link if we're in a subdirectory
    if (subPath) {
      const parentPath = path.dirname(subPath);
      const parentQuery = parentPath === '.' ? '' : `?path=${encodeURIComponent(parentPath)}`;
      fileListHtml += `<li><a href="/${parentQuery}">📁 ..</a></li>`;
    }
    
    files.forEach(file => {
      const fullPath = path.join(directoryPath, file);
      const relativePath = path.join(subPath, file);
      const stats = fs.statSync(fullPath);
      
      if (stats.isDirectory()) {
        // Folder - make it clickable to navigate
        fileListHtml += `<li>
          <a href="/?path=${encodeURIComponent(relativePath)}">📁 ${file}</a>
          <button class="copy-btn" onclick="copyFile('${relativePath.replace(/'/g, "\\'")}', true)" title="Copy folder">⚙️</button>
        </li>`;
      } else {
        // File - link to editor
        fileListHtml += `<li>
          <a href="/edit-file?file=${encodeURIComponent(relativePath)}">📄 ${file}</a>
          <button class="copy-url-btn" onclick="copyFileUrl('${relativePath.replace(/'/g, "\\'")}', '${file.replace(/'/g, "\\'")}', event)" title="Copy URL">📋</button>
          <button class="copy-btn" onclick="copyFile('${relativePath.replace(/'/g, "\\'")}', false)" title="Settings">⚙️</button>
        </li>`;
      }
    });
    
    // Replace placeholders
    html = html.replace('{{FILES}}', fileListHtml);
    html = html.replace('{{CURRENT_PATH}}', subPath || '/app/data');
    
    res.send(html);
  });
});

// Handle file uploads from the file browser
app.post('/upload-file', auth, uploadGeneral.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No file uploaded' });
  }
  
  res.json({ success: true, filename: req.file.originalname });
});

// Create a new folder
app.post('/create-folder', auth, express.json(), (req, res) => {
  const subPath = req.body.path || '';
  const folderName = req.body.folderName;
  
  if (!folderName) {
    return res.status(400).json({ success: false, error: 'Folder name is required' });
  }
  
  const newFolderPath = path.join('/app/data', subPath, folderName);
  
  fs.mkdir(newFolderPath, { recursive: true }, (err) => {
    if (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
    res.json({ success: true, folderName: folderName });
  });
});

// Copy file or folder to another directory
app.post('/copy-to-directory', auth, express.json(), (req, res) => {
  const sourcePath = req.body.sourcePath;
  const targetPath = req.body.targetPath;
  const isDirectory = req.body.isDirectory;
  
  if (!sourcePath || !targetPath) {
    return res.status(400).json({ success: false, error: 'Source and target paths are required' });
  }
  
  const fullSourcePath = path.join('/app/data', sourcePath);
  const fullTargetPath = path.join('/app/data', targetPath);
  
  // Ensure target directory exists
  const targetDir = path.dirname(fullTargetPath);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  
  // Copy file or directory
  if (isDirectory) {
    // Copy directory recursively
    const copyDir = (src, dest) => {
      if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
      }
      const entries = fs.readdirSync(src, { withFileTypes: true });
      for (let entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
          copyDir(srcPath, destPath);
        } else {
          fs.copyFileSync(srcPath, destPath);
        }
      }
    };
    
    try {
      copyDir(fullSourcePath, fullTargetPath);
      res.json({ success: true, message: 'Folder copied successfully' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  } else {
    // Copy file
    fs.copyFile(fullSourcePath, fullTargetPath, (err) => {
      if (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
      res.json({ success: true, message: 'File copied successfully' });
    });
  }
});

// Delete file or empty folder
app.post('/delete-item', auth, express.json(), (req, res) => {
  const itemPath = req.body.itemPath;
  const isDirectory = req.body.isDirectory;
  
  if (!itemPath) {
    return res.status(400).json({ success: false, error: 'Item path is required' });
  }
  
  const fullPath = path.join('/app/data', itemPath);
  
  if (!fs.existsSync(fullPath)) {
    return res.status(404).json({ success: false, error: 'Item not found' });
  }
  
  try {
    if (isDirectory) {
      // Check if directory is empty
      const contents = fs.readdirSync(fullPath);
      if (contents.length > 0) {
        return res.status(400).json({ 
          success: false, 
          error: 'Cannot delete folder: folder is not empty' 
        });
      }
      // Delete empty directory
      fs.rmdirSync(fullPath);
      res.json({ success: true, message: 'Empty folder deleted successfully' });
    } else {
      // Delete file
      fs.unlinkSync(fullPath);
      res.json({ success: true, message: 'File deleted successfully' });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/edit-file', (req, res) => {
  const fileName = req.query.file;
  if (!fileName) {
    return res.status(400).send('File parameter is required');
  }
  
  const filePath = path.join('/app/data', fileName);
  
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      return res.status(500).send('Error reading file: ' + err.message);
    }
    
    let jsonData = {};
    try {
      jsonData = JSON.parse(data);
    } catch (e) {
      return res.status(500).send('File is not valid JSON');
    }
    
    // Read the HTML template
    const templatePath = path.join(__dirname, 'views', 'json-editor.html');
    let html = fs.readFileSync(templatePath, 'utf8');
    
    // Replace placeholders
    html = html.replace(/\{\{FILENAME\}\}/g, fileName);
    html = html.replace('{{JSONDATA}}', JSON.stringify(jsonData));
    
    res.send(html);
  });
});

app.post('/save-file', (req, res) => {
  const { fileName, content } = req.body;
  
  if (!fileName) {
    return res.status(400).send('fileName is required');
  }
  
  const filePath = path.join('/app/data', fileName);
  
  fs.writeFile(filePath, JSON.stringify(content, null, 2), (writeErr) => {
    if (writeErr) {
      return res.status(500).send('Error writing file: ' + writeErr.message);
    }
    res.send('File saved successfully');
  });
});

app.post('/duplicate-file', (req, res) => {
  const { fileName, newFileName, content } = req.body;
  
  if (!fileName || !newFileName) {
    return res.status(400).send('fileName and newFileName are required');
  }
  
  const newFilePath = path.join('/app/data', newFileName);
  
  fs.writeFile(newFilePath, JSON.stringify(content, null, 2), (writeErr) => {
    if (writeErr) {
      return res.status(500).send('Error duplicating file: ' + writeErr.message);
    }
    res.send('File duplicated successfully');
  });
});

app.post('/delete-file', (req, res) => {
  const { fileName } = req.body;
  
  if (!fileName) {
    return res.status(400).send('fileName is required');
  }
  
  const filePath = path.join('/app/data', fileName);
  
  fs.unlink(filePath, (err) => {
    if (err) {
      return res.status(500).send('Error deleting file: ' + err.message);
    }
    res.send('File deleted successfully');
  });
});

app.post('/init-json', (req, res) => {
  const filePath = resolveFilePath(req.body.file);
  if (!filePath) {
    return res.status(400).send('file is required');
  }
  
  const initialData = {
    message: "hello world"
  };

  fs.writeFile(filePath, JSON.stringify(initialData, null, 2), (writeErr) => {
    if (writeErr) {
      return res.status(500).send('Error writing file');
    }
    res.send('JSON file initialized successfully');
  });
});

app.get('/get-json', (req, res) => {
  const filePath = resolveFilePath(req.query.file || req.body.file);
  if (!filePath) {
    return res.status(400).send('file is required');
  }
  
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      return res.status(500).send('Error reading file');
    }
    let jsonData = {};
    try {
      jsonData = JSON.parse(data);
    } catch (parseErr) {
      return res.status(500).send('Error parsing JSON');
    }
    res.json(jsonData);
  });
});

app.post('/update-json', (req, res) => {
  const { file: fileInput, ...dataToUpdate } = req.body;
  const filePath = resolveFilePath(fileInput);
  
  if (!filePath) {
    return res.status(400).send('file is required');
  }
  
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      return res.status(500).send('Error reading file');
    }
    let jsonData = {};
    try {
      jsonData = JSON.parse(data);
    } catch (parseErr) {
      return res.status(500).send('Error parsing JSON');
    }

    // Update jsonData as needed; for example, merge new fields
    Object.assign(jsonData, dataToUpdate);

    fs.writeFile(filePath, JSON.stringify(jsonData, null, 2), (writeErr) => {
      if (writeErr) {
        return res.status(500).send('Error writing file');
      }
      res.send('JSON file updated successfully');
    });
  });
});

app.patch('/edit-json', (req, res) => {
  const { file: fileInput, ...dataToEdit } = req.body;
  const filePath = resolveFilePath(fileInput);
  
  if (!filePath) {
    return res.status(400).send('file is required');
  }
  
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      return res.status(500).send('Error reading file');
    }
    let jsonData = {};
    try {
      jsonData = JSON.parse(data);
    } catch (parseErr) {
      return res.status(500).send('Error parsing JSON');
    }

    // Only update fields that already exist in the JSON
    Object.keys(dataToEdit).forEach(key => {
      if (jsonData.hasOwnProperty(key)) {
        jsonData[key] = dataToEdit[key];
      }
    });

    fs.writeFile(filePath, JSON.stringify(jsonData, null, 2), (writeErr) => {
      if (writeErr) {
        return res.status(500).send('Error writing file');
      }
      res.send('JSON file edited successfully');
    });
  });
});

app.post('/inc', (req, res) => {
  const { file: fileInput, key } = req.body;
  const filePath = resolveFilePath(fileInput);
  
  if (!filePath) {
    return res.status(400).send('file is required');
  }
  
  if (!key) {
    return res.status(400).send('key is required');
  }
  
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      return res.status(500).send('Error reading file');
    }
    let jsonData = {};
    try {
      jsonData = JSON.parse(data);
    } catch (parseErr) {
      return res.status(500).send('Error parsing JSON');
    }

    // Only increment if key exists and value is a number
    if (key in jsonData && typeof jsonData[key] === 'number') {
      jsonData[key]++;
      
      fs.writeFile(filePath, JSON.stringify(jsonData, null, 2), (writeErr) => {
        if (writeErr) {
          return res.status(500).send('Error writing file');
        }
        res.json({ key: key, value: jsonData[key] });
      });
    } else {
      // Key doesn't exist or is not a number, do nothing
      res.json({ message: 'Key not found or not a number, no action taken' });
    }
  });
});

// Upload image route - accepts any field name
app.post('/upload-image', (req, res) => {
  upload.any()(req, res, function (err) {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ 
        error: 'Upload error',
        message: err.message,
        code: err.code
      });
    } else if (err) {
      return res.status(400).json({ 
        error: 'File upload failed',
        message: err.message
      });
    }
    
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ 
        error: 'No file uploaded',
        info: 'Please send file as multipart/form-data'
      });
    }
    
    const file = req.files[0]; // Get first uploaded file
    const fileUrl = `${req.protocol}://${req.get('host')}/u/${file.filename}`;
    const filePath = file.path;
    
    // Schedule file deletion after 5 minutes
    setTimeout(() => {
      fs.unlink(filePath, (err) => {
        if (err) {
          console.error('Error deleting file:', err);
        } else {
          console.log('File deleted:', file.filename);
        }
      });
    }, 10 * 60 * 1000); // 5 minutes in milliseconds
    
    res.json({
      url: fileUrl,
      filename: file.filename,
      expiresIn: '10 minutes'
    });
  });
});

// Public route to access nested JSON values in /db folder
app.get('/db/*/*.json/*', (req, res) => {
  const fullPath = req.params[0];
  const jsonFile = req.params[1] + '.json';
  const nestedPath = req.params[2];
  
  const filePath = path.join('/app/data/db', fullPath, jsonFile);
  const keys = nestedPath.split('/').filter(k => k.length > 0);
  
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      return res.status(404).send('File not found');
    }
    
    let jsonData = {};
    try {
      jsonData = JSON.parse(data);
    } catch (parseErr) {
      return res.status(500).send('Error parsing JSON');
    }
    
    // Navigate through nested keys
    let value = jsonData;
    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        return res.status(404).send('Key not found');
      }
    }
    
    // Add caching headers
    res.set('Cache-Control', 'public, max-age=300, s-maxage=3600');
    res.set('CDN-Cache-Control', 'public, max-age=3600');
    
    res.json(value);
  });
});

// Serve uploaded images publicly with semi-aggressive caching
app.use('/u', express.static('/app/data/u', {
  maxAge: '1h', // Cache for 1 hour at CDN edge
  etag: true,
  lastModified: true,
  setHeaders: (res, path) => {
    // Semi-aggressive CDN caching - allows updates within reasonable time
    res.set('Cache-Control', 'public, max-age=3600'); // 1 hour
    res.set('CDN-Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  }
}));

// Serve db folder publicly with semi-aggressive caching
app.use('/db', express.static('/app/data/db', {
  maxAge: '1h', // Cache for 1 hour at CDN edge
  etag: true,
  lastModified: true,
  setHeaders: (res, path) => {
    // Semi-aggressive CDN caching - allows updates within reasonable time
    res.set('Cache-Control', 'public, max-age=3600'); // 1 hour
    res.set('CDN-Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  }
}));

// Public route to access raw JSON files without auth
app.get('/:filename', (req, res) => {
  const filename = req.params.filename;
  
  // Only process .json files
  if (!filename.endsWith('.json')) {
    return res.status(404).send('Not found');
  }
  
  const filePath = path.join('/app/data', filename);
  
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      return res.status(404).send('File not found');
    }
    
    let jsonData = {};
    try {
      jsonData = JSON.parse(data);
    } catch (parseErr) {
      return res.status(500).send('Error parsing JSON');
    }
    
    // Add aggressive caching headers for JSON responses
    res.set('Cache-Control', 'public, max-age=300, s-maxage=3600'); // 5min browser, 1h CDN
    res.set('CDN-Cache-Control', 'public, max-age=3600');
    
    res.json(jsonData);
  });
});

// Public route to access nested JSON values
app.get('/:filename/*', (req, res) => {
  const filename = req.params.filename;
  
  // Only process .json files
  if (!filename.endsWith('.json')) {
    return res.status(404).send('Not found');
  }
  
  const filePath = path.join('/app/data', filename);
  
  // Get the nested path from the URL (everything after filename)
  const nestedPath = req.params[0]; // This captures the wildcard part
  const keys = nestedPath.split('/').filter(k => k.length > 0);
  
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      return res.status(404).send('File not found');
    }
    
    let jsonData = {};
    try {
      jsonData = JSON.parse(data);
    } catch (parseErr) {
      return res.status(500).send('Error parsing JSON');
    }
    
    // Navigate through nested keys
    let value = jsonData;
    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        return res.status(404).send('Key not found');
      }
    }
    
    // Add aggressive caching headers for nested JSON responses
    res.set('Cache-Control', 'public, max-age=300, s-maxage=3600'); // 5min browser, 1h CDN
    res.set('CDN-Cache-Control', 'public, max-age=3600');
    
    // Return the value as JSON (could be object, array, string, number, etc.)
    res.json(value);
  });
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
