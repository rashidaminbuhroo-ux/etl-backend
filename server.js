const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

const app = express();
app.use(cors({ origin: '*', methods: ['GET', 'POST'] }));
app.use(express.json());

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, `${uuidv4()}-${file.originalname}`)
});

const upload = multer({ storage });
const tasks = {};

app.get('/', (req, res) => res.send('🚀 Converter API is Online'));

app.post('/api/convert', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file' });

    const taskId = uuidv4();
    const inputPath = req.file.path;
    const outputPath = path.join(uploadDir, `${taskId}.pcap`);
    const exePath = path.join(__dirname, 'etl2pcapng.exe');

    tasks[taskId] = { status: 'processing', progress: 0 };

    let prog = 0;
    const interval = setInterval(() => { if (prog < 90) tasks[taskId].progress = (prog += 10); }, 500);

    const cmd = `wine64 "${exePath}" "${inputPath}" "${outputPath}"`;
    console.log(`[EXEC] Running command: ${cmd}`);

    exec(cmd, (error, stdout, stderr) => {
        clearInterval(interval);

        // 🚨 WE NEED TO SEE THESE LOGS IN RENDER 🚨
        console.log("\n====== WINE DEBUG LOGS ======");
        if (error) console.error(`[ERROR]:`, error.message);
        if (stdout) console.log(`[STDOUT]:`, stdout);
        if (stderr) console.error(`[STDERR]:`, stderr);
        console.log("=============================\n");

        setTimeout(() => {
            if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
                tasks[taskId].status = 'completed';
                tasks[taskId].progress = 100;
                tasks[taskId].downloadUrl = `/api/download/${taskId}`;
            } else {
                tasks[taskId].status = 'error';
            }
            if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
        }, 2000); 
    });

    res.json({ taskId });
});

app.get('/api/status/:taskId', (req, res) => res.json(tasks[req.params.taskId] || { status: 'error' }));

app.get('/api/download/:taskId', (req, res) => {
    const file = path.join(uploadDir, `${req.params.taskId}.pcap`);
    if (fs.existsSync(file)) res.download(file);
    else res.status(404).send('File not found');
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Running on ${PORT}`));
