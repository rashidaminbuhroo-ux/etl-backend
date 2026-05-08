const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors({ origin: '*', methods: ['GET', 'POST'] }));
app.use(express.json());

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// 🌐 EXTREMELY IMPORTANT: This allows GitHub to temporarily download the uploaded ETL file
app.use('/files', express.static(uploadDir));

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, `${uuidv4()}.etl`)
});

const upload = multer({ storage });
const tasks = {};

app.get('/', (req, res) => res.send('🚀 Render-to-GitHub Distributed API is Online'));

// 🚦 STEP 1: User Uploads file. Render saves it and alerts GitHub.
app.post('/api/convert', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file' });

    // Ensure Render environment variable exists
    if (!process.env.GITHUB_TOKEN) {
        console.error("🚨 CRITICAL ERROR: GITHUB_TOKEN is missing in Render Environment Variables!");
        return res.status(500).json({ error: 'Server misconfiguration' });
    }

    const taskId = path.parse(req.file.filename).name;
    tasks[taskId] = { status: 'processing', progress: 10 };

    // Build the URLs so GitHub knows where to pull from and push back to
    const renderHost = `https://${req.get('host')}`;
    const etlUrl = `${renderHost}/files/${taskId}.etl`;
    const returnUrl = `${renderHost}/api/webhook/return`;

    // 🚀 Fire the signal to wake up the Windows Server
    try {
        console.log(`[TRIGGER] Waking up GitHub Windows Server for Task: ${taskId}...`);
        
        // I put your exact GitHub repo name based on your screenshots
        const githubRepo = 'rashidaminbuhroo-ux/etl-backend'; 
        
        await fetch(`https://api.github.com/repos/${githubRepo}/dispatches`, {
            method: 'POST',
            headers: {
                'Accept': 'application/vnd.github.v3+json',
                'Authorization': `token ${process.env.GITHUB_TOKEN}`
            },
            body: JSON.stringify({
                event_type: 'convert_etl',
                client_payload: { etl_url: etlUrl, return_url: returnUrl, task_id: taskId }
            })
        });
        
        // Fake a slow progress bar since we are waiting on GitHub
        let prog = 10;
        const interval = setInterval(() => { 
            if (prog < 90 && tasks[taskId].status === 'processing') tasks[taskId].progress = (prog += 5); 
            else clearInterval(interval);
        }, 3000);

    } catch (error) {
        console.error('GitHub API Error:', error);
        tasks[taskId].status = 'error';
    }

    res.json({ taskId });
});

// 📥 STEP 2: The GitHub Windows Server finishes and POSTs the PCAP back here
const returnUpload = multer({ dest: uploadDir });
app.post('/api/webhook/return', returnUpload.single('file'), (req, res) => {
    const taskId = req.body.taskId;
    if (!tasks[taskId]) return res.status(400).send('Task not found');

    console.log(`[SUCCESS] Render received completed PCAP from Windows Server for Task: ${taskId}`);

    // Name the PCAP correctly
    const finalPcapPath = path.join(uploadDir, `${taskId}.pcap`);
    fs.renameSync(req.file.path, finalPcapPath);

    // Delete the original .etl to save space on Render
    const originalEtl = path.join(uploadDir, `${taskId}.etl`);
    if (fs.existsSync(originalEtl)) fs.unlinkSync(originalEtl);

    // Tell the frontend it's ready for download
    tasks[taskId].progress = 100;
    tasks[taskId].status = 'completed';
    tasks[taskId].downloadUrl = `/api/download/${taskId}`;

    res.send('Success');
});

app.get('/api/status/:taskId', (req, res) => res.json(tasks[req.params.taskId] || { status: 'error' }));

app.get('/api/download/:taskId', (req, res) => {
    const file = path.join(uploadDir, `${req.params.taskId}.pcap`);
    if (fs.existsSync(file)) {
        res.download(file, `converted-${req.params.taskId}.pcap`, (err) => {
            if (!err) {
                setTimeout(() => { if (fs.existsSync(file)) fs.unlinkSync(file); }, 60000); // Cleanup after 1 min
            }
        });
    } else {
        res.status(404).send('File not found');
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Running on ${PORT}`));
