const express = require('express');
const fs = require('fs');
const path = require('path');
const basicAuth = require('express-basic-auth');
const app = express();

app.use(express.json()); // for parsing application/json

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
  const directoryPath = '/app/data';
  
  fs.readdir(directoryPath, (err, files) => {
    if (err) {
      return res.status(500).send('Error reading directory: ' + err.message);
    }
    
    let html = `
      <html>
        <head>
          <title>JSON File Manager</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; background: #f5f5f5; }
            h1 { color: #333; }
            ul { list-style: none; padding: 0; }
            li { 
              background: white; 
              margin: 5px 0; 
              padding: 10px; 
              border-radius: 4px;
              box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            }
            a { 
              color: #0066cc; 
              text-decoration: none; 
              font-size: 16px;
            }
            a:hover { text-decoration: underline; }
          </style>
        </head>
        <body>
          <h1>📁 JSON Files in /app/data</h1>
          <ul>
    `;
    
    files.forEach(file => {
      html += `<li><a href="/edit-file?file=${encodeURIComponent(file)}">${file}</a></li>`;
    });
    
    html += `
          </ul>
        </body>
      </html>
    `;
    
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
    
    const html = `
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=yes">
          <title>Edit ${fileName}</title>
          <link href="https://cdn.jsdelivr.net/npm/jsoneditor@9.10.4/dist/jsoneditor.min.css" rel="stylesheet" type="text/css">
          <script src="https://cdn.jsdelivr.net/npm/jsoneditor@9.10.4/dist/jsoneditor.min.js"></script>
          <style>
            * { box-sizing: border-box; }
            body { 
              font-family: Arial, sans-serif; 
              padding: 10px; 
              background: #f5f5f5; 
              margin: 0;
            }
            .header { 
              margin-bottom: 15px; 
            }
            .back-link { 
              color: #0066cc; 
              text-decoration: none;
              font-size: 14px;
              display: inline-block;
              margin-bottom: 8px;
            }
            .back-link:hover { text-decoration: underline; }
            .file-name { 
              color: #333; 
              margin: 0;
              font-size: 18px;
              word-break: break-all;
            }
            #jsoneditor { 
              width: 100%; 
              height: calc(100vh - 180px);
              min-height: 400px;
              border: 1px solid #ddd;
              border-radius: 4px;
              box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            }
            .save-btn {
              background: #28a745;
              color: white;
              border: none;
              padding: 12px 20px;
              font-size: 16px;
              border-radius: 4px;
              cursor: pointer;
              margin-top: 10px;
              width: 100%;
              max-width: 200px;
            }
            .save-btn:hover { background: #218838; }
            .save-btn:active { background: #1e7e34; }
            .message {
              margin-top: 10px;
              padding: 10px;
              border-radius: 4px;
              display: none;
              font-size: 14px;
            }
            .message.success { background: #d4edda; color: #155724; display: block; }
            .message.error { background: #f8d7da; color: #721c24; display: block; }
            
            /* Hide the "powered by ace" link */
            .jsoneditor-poweredBy { display: none !important; }
            
            @media (max-width: 768px) {
              body { padding: 8px; }
              .file-name { font-size: 16px; }
              .save-btn { 
                max-width: 100%;
                font-size: 18px;
                padding: 14px;
              }
              #jsoneditor {
                height: calc(100vh - 160px);
              }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <a href="/" class="back-link">← Back to files</a>
              <h2 class="file-name">📝 Editing: ${fileName}</h2>
            </div>
          </div>
          <div id="jsoneditor"></div>
          <button class="save-btn" onclick="saveJson()">💾 Save Changes</button>
          <div id="message" class="message"></div>
          
          <script>
            const container = document.getElementById('jsoneditor');
            const options = {
              mode: 'code',
              modes: ['code', 'tree', 'view'],
              onError: function (err) {
                alert(err.toString());
              }
            };
            const editor = new JSONEditor(container, options);
            editor.set(${JSON.stringify(jsonData)});
            
            async function saveJson() {
              try {
                const json = editor.get();
                const response = await fetch('/save-file', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    fileName: '${fileName}',
                    content: json
                  })
                });
                
                const result = await response.text();
                const messageEl = document.getElementById('message');
                
                if (response.ok) {
                  messageEl.className = 'message success';
                  messageEl.textContent = '✓ ' + result;
                } else {
                  messageEl.className = 'message error';
                  messageEl.textContent = '✗ ' + result;
                }
                
                setTimeout(() => {
                  messageEl.style.display = 'none';
                }, 3000);
              } catch (error) {
                const messageEl = document.getElementById('message');
                messageEl.className = 'message error';
                messageEl.textContent = '✗ Error: ' + error.message;
              }
            }
          </script>
        </body>
      </html>
    `;
    
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

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
