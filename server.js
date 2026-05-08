const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

const app = express();

// ✅ CORS fixed for Global Access
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type']
}));

app.use(express.json());

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

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

app.get('/', (req, res) => {
    res.send('🚀 ETL to PCAP API is Live and Ready!');
});

app.post('/api/convert', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

    const taskId = uuidv4();
    const inputPath = req.file.path;
    const outputPath = path.join(uploadDir, `${taskId}.pcap`);
    const exePath = path.join(__dirname, 'etl2pcapng.exe');

    tasks[taskId] = { status: 'processing', progress: 0, file: req.file.originalname, downloadUrl: null };

    let progress = 0;
    const progressInterval = setInterval(() => {
        if (progress < 90) {
            progress += 10;
            tasks[taskId].progress = progress;
        }
    }, 500);

    // ✅ BULLETPROOF COMMAND: Uses full paths and standard wine
    const cmd = `wine "${exePath}" "${inputPath}" "${outputPath}"`;

    console.log(`Executing: ${cmd}`);

    exec(cmd, (error, stdout, stderr) => {
        clearInterval(progressInterval);

        // Give Linux a split second to finalize the file writing
        setTimeout(() => {
            if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
                console.error(`Conversion Failed or 0-byte file generated.`);
                tasks[taskId].status = 'error';
                return;
            }

            tasks[taskId].progress = 100;
            tasks[taskId].status = 'completed';
            tasks[taskId].downloadUrl = `/api/download/${taskId}`;
            
            // Cleanup the heavy .etl file
            fs.unlink(inputPath, () => console.log('Original ETL cleaned up.'));
        }, 1000); 
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
            // Keep the file for 1 minute then delete so user actually gets the data
            setTimeout(() => {
                if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
                delete tasks[req.params.taskId];
            }, 60000);
        }
    });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Backend running on port ${PORT}`));
