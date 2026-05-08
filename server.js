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

// Allows GitHub to download the ETL from Render
app.use('/files', express.static(uploadDir));

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, `${uuidv4()}.etl`)
});

const upload = multer({ storage });
const tasks = {};

app.get('/', (req, res) => res.send('🚀 Distributed Windows Engine is Online'));

app.post('/api/convert', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file' });

    if (!process.env.GITHUB_TOKEN) {
        console.error("🚨 GITHUB_TOKEN MISSING IN RENDER ENV VARS");
        return res.status(500).json({ error: 'Server misconfiguration' });
    }

    const taskId = path.parse(req.file.filename).name;
    tasks[taskId] = { status: 'processing', progress: 10 };

    const renderHost = `https://${req.get('host')}`;
    const etlUrl = `${renderHost}/files/${taskId}.etl`;
    const returnUrl = `${renderHost}/api/webhook/return`;

    try {
        console.log(`[TRIGGER] Pinging GitHub for Task: ${taskId}`);
        
        // 🚨 DOUBLE CHECK: Ensure this matches your GitHub URL exactly
        const githubRepo = 'rashidaminbuhroo-ux/etl-backend'; 
        
        const response = await fetch(`https://api.github.com/repos/${githubRepo}/dispatches`, {
            method: 'POST',
            headers: {
                'Accept': 'application/vnd.github.v3+json',
                'Authorization': `token ${process.env.GITHUB_TOKEN.trim()}`,
                'X-GitHub-Api-Version': '2022-11-28',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                event_type: 'convert_etl',
                client_payload: { etl_url: etlUrl, return_url: returnUrl, task_id: taskId }
            })
        });

        console.log(`[GITHUB RESPONSE] Status: ${response.status} ${response.statusText}`);

        if (response.status !== 204) {
            const errData = await response.text();
            console.error(`[GITHUB ERROR]: ${errData}`);
        }
        
        let prog = 10;
        const interval = setInterval(() => { 
            if (prog < 95 && tasks[taskId].status === 'processing') tasks[taskId].progress = (prog += 2); 
            else clearInterval(interval);
        }, 4000);

    } catch (error) {
        console.error('Fetch Error:', error);
        tasks[taskId].status = 'error';
    }

    res.json({ taskId });
});

app.post('/api/webhook/return', multer({ dest: uploadDir }).single('file'), (req, res) => {
    const taskId = req.body.taskId;
    if (!tasks[taskId]) return res.status(400).send('Task not found');

    const finalPcapPath = path.join(uploadDir, `${taskId}.pcap`);
    if (req.file) {
        fs.renameSync(req.file.path, finalPcapPath);
        tasks[taskId].status = 'completed';
        tasks[taskId].progress = 100;
        tasks[taskId].downloadUrl = `/api/download/${taskId}`;
        console.log(`[DONE] Task ${taskId} finished by Windows Server.`);
    }

    const originalEtl = path.join(uploadDir, `${taskId}.etl`);
    if (fs.existsSync(originalEtl)) fs.unlinkSync(originalEtl);
    res.send('OK');
});

app.get('/api/status/:taskId', (req, res) => res.json(tasks[req.params.taskId] || { status: 'error' }));

app.get('/api/download/:taskId', (req, res) => {
    const file = path.join(uploadDir, `${req.params.taskId}.pcap`);
    if (fs.existsSync(file)) res.download(file);
    else res.status(404).send('Not found');
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Running on ${PORT}`));
