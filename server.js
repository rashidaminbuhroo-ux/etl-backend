const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

const app = express();
app.use(cors());
app.use(express.json());

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, `${uuidv4()}-${file.originalname}`)
});

const upload = multer({ 
    storage,
    fileFilter: (req, file, cb) => {
        if (path.extname(file.originalname).toLowerCase() !== '.etl') {
            return cb(new Error('Only .etl files are allowed'));
        }
        cb(null, true);
    }
});

const tasks = {};

app.post('/api/convert', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

    const taskId = uuidv4();
    const inputPath = req.file.path;
    const outputPath = path.join(uploadDir, `${taskId}.pcap`);

    tasks[taskId] = { status: 'processing', progress: 0, file: req.file.originalname, downloadUrl: null };

    let progress = 0;
    const progressInterval = setInterval(() => {
        if (progress < 90) {
            progress += 10;
            tasks[taskId].progress = progress;
        }
    }, 500);

    // Run Windows .exe via Wine on Linux server
    const cmd = `wine64 etl2pcapng.exe "${inputPath}" "${outputPath}"`;

    exec(cmd, (error, stdout, stderr) => {
        clearInterval(progressInterval);

        if (!fs.existsSync(outputPath)) {
            console.error(`Conversion Failed. PCAP not generated.`);
            tasks[taskId].status = 'error';
            return;
        }

        tasks[taskId].progress = 100;
        tasks[taskId].status = 'completed';
        tasks[taskId].downloadUrl = `/api/download/${taskId}`;
        
        fs.unlink(inputPath, () => console.log('Original ETL cleaned up.'));
    });

    res.json({ taskId, message: 'Conversion started' });
});

app.get('/api/status/:taskId', (req, res) => {
    const task = tasks[req.params.taskId];
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json(task);
});

app.get('/api/download/:taskId', (req, res) => {
    const outputPath = path.join(uploadDir, `${req.params.taskId}.pcap`);
    if (!fs.existsSync(outputPath)) return res.status(404).json({ error: 'File not found.' });

    res.download(outputPath, `converted-${req.params.taskId}.pcap`, (err) => {
        if (!err) {
            fs.unlink(outputPath, () => console.log('Converted PCAP cleaned up.'));
            delete tasks[req.params.taskId];
        }
    });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Backend running on port ${PORT}`));
