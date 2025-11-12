const express = require('express');
const fs = require('fs');
const app = express();

app.use(express.json()); // for parsing application/json

const jsonFilePath = './data.json';

app.get('/get-json', (req, res) => {
  fs.readFile(jsonFilePath, 'utf8', (err, data) => {
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
  fs.readFile(jsonFilePath, 'utf8', (err, data) => {
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
    Object.assign(jsonData, req.body);

    fs.writeFile(jsonFilePath, JSON.stringify(jsonData, null, 2), (writeErr) => {
      if (writeErr) {
        return res.status(500).send('Error writing file');
      }
      res.send('JSON file updated successfully');
    });
  });
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
