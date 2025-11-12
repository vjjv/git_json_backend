const express = require('express');
const fs = require('fs');
const path = require('path');
const basicAuth = require('express-basic-auth');
const app = express();

app.use(express.json()); // for parsing application/json

// Basic auth middleware for protected routes
const auth = basicAuth({
  users: { 
    [process.env.ADMIN_USERNAME]: process.env.ADMIN_PASSWORD 
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
  const directoryPath = '/app/data';
  
  fs.readdir(directoryPath, (err, files) => {
    if (err) {
      return res.status(500).send('Error reading directory: ' + err.message);
    }
    
    // Read the HTML template
    const templatePath = path.join(__dirname, 'views', 'file-list.html');
    let html = fs.readFileSync(templatePath, 'utf8');
    
    // Generate file list HTML
    let fileListHtml = '';
    files.forEach(file => {
      fileListHtml += `<li><a href="/edit-file?file=${encodeURIComponent(file)}">${file}</a></li>`;
    });
    
    // Replace placeholder with actual file list
    html = html.replace('{{FILES}}', fileListHtml);
    
    res.send(html);
  });
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
  const filePath = resolveFilePath(req.body.filePath);
  if (!filePath) {
    return res.status(400).send('filePath is required');
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
  const filePath = resolveFilePath(req.query.filePath || req.body.filePath);
  if (!filePath) {
    return res.status(400).send('filePath is required');
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
  const { filePath: filePathInput, ...dataToUpdate } = req.body;
  const filePath = resolveFilePath(filePathInput);
  
  if (!filePath) {
    return res.status(400).send('filePath is required');
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
  const { filePath: filePathInput, ...dataToEdit } = req.body;
  const filePath = resolveFilePath(filePathInput);
  
  if (!filePath) {
    return res.status(400).send('filePath is required');
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
    
    // Return the value as JSON (could be object, array, string, number, etc.)
    res.json(value);
  });
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
