const express = require('express');
const path = require('path');
const { exec, spawn } = require('child_process');
const os = require('os');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    next();
});

// Serve static files
app.use(express.static(path.join(__dirname, 'dist')));
app.use(express.json({ limit: '10mb' })); 

// --- LOGGING SETUP ---
const LOG_DIR = path.join(__dirname, 'logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR);

// --- DATA PERSISTENCE LAYER ---
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const jsonDb = {
    read: (filename, defaultValue) => {
        const filePath = path.join(DATA_DIR, filename);
        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2));
            return defaultValue;
        }
        try {
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } catch (e) {
            console.error(`Error reading ${filename}:`, e);
            return defaultValue;
        }
    },
    write: (filename, data) => {
        try {
            fs.writeFileSync(path.join(DATA_DIR, filename), JSON.stringify(data, null, 2));
            return true;
        } catch (e) {
            console.error(`Error writing ${filename}:`, e);
            return false;
        }
    }
};

const DEFAULTS = {
    users: [{ id: 'u1', username: 'admin', password: 'password', name: 'Administrador', role: 'ADMIN', createdAt: new Date() }],
    config: {
        appName: 'CamHome',
        enableAuth: true,
        enableMfa: false,
        ddnsProvider: 'noip',
        ddnsHostname: '',
        recordingPath: '/mnt/orange_drive_1tb/gravacoes',
        minAlertLevel: 'INFO',
        enableSound: true
    },
    cameras: []
};

// --- NVR / RECORDING ENGINE ---
const recorders = {}; 

function sanitize(str) {
    return str.replace(/[^a-z0-9]/gi, '_').toLowerCase();
}

function getStreamUrlWithAuth(camera) {
    let url = camera.streamUrl;
    if (!url) return null;
    if (camera.username && camera.password && !url.includes('@') && url.startsWith('rtsp://')) {
        return url.replace('rtsp://', `rtsp://${camera.username}:${camera.password}@`);
    }
    return url;
}

function startRecording(camera) {
    const config = jsonDb.read('config.json', DEFAULTS.config);
    if (!config.recordingPath) return;

    if (recorders[camera.id]) {
        stopRecording(camera.id);
    }

    if (camera.status !== 'ONLINE' && camera.status !== 'RECORDING') return;
    const streamUrl = getStreamUrlWithAuth(camera);
    if (!streamUrl) return;

    const camFolder = path.join(config.recordingPath, sanitize(camera.name));
    if (!fs.existsSync(camFolder)) {
        try {
            fs.mkdirSync(camFolder, { recursive: true });
        } catch (e) {
            console.error(`[NVR] Failed to create folder ${camFolder}:`, e);
            return;
        }
    }

    console.log(`[NVR] Starting recording for ${camera.name}...`);

    const args = [
        '-y',
        '-rtsp_transport', 'tcp', 
        '-i', streamUrl,
        '-c', 'copy',             
        '-map', '0',
        '-f', 'segment',
        '-segment_time', '600',   // 10 minutes
        '-segment_format', 'mp4',
        '-strftime', '1',
        '-reset_timestamps', '1',
        path.join(camFolder, '%Y-%m-%d_%H-%M-%S.mp4')
    ];

    const proc = spawn('ffmpeg', args);

    recorders[camera.id] = {
        process: proc,
        startTime: Date.now()
    };

    proc.on('close', (code) => {
        console.log(`[NVR] Recording stopped for ${camera.name} (Code ${code})`);
        delete recorders[camera.id];
        
        const wasRunningLongEnough = (Date.now() - (recorders[camera.id]?.startTime || 0)) > 10000;
        
        if (code !== 0 || wasRunningLongEnough) {
            console.log(`[NVR] Restarting ${camera.name} in 15s...`);
            setTimeout(() => {
                const currentCams = jsonDb.read('cameras.json', []);
                const currentCam = currentCams.find(c => c.id === camera.id);
                if (currentCam) startRecording(currentCam);
            }, 15000);
        }
    });
}

function stopRecording(cameraId) {
    if (recorders[cameraId]) {
        recorders[cameraId].process.kill('SIGTERM'); 
        delete recorders[cameraId];
    }
}

function initializeRecorder() {
    const cameras = jsonDb.read('cameras.json', []);
    console.log(`[NVR] Initializing ${cameras.length} cameras...`);
    cameras.forEach(cam => {
        startRecording(cam);
    });
}

// --- HELPER FUNCTIONS ---
const MAC_VENDORS = {
    'e0:50:8b': 'Hikvision', '00:40:8c': 'Axis', '00:0f:7c': 'Dahua',
    'bc:32:5e': 'Dahua', 'a0:bd:1d': 'TP-Link', '00:62:6e': 'Foscam',
    'b0:c5:54': 'D-Link', 'dc:4f:22': 'ESP32', 'b8:27:eb': 'RaspberryPi'
};

function getLocalNetwork() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal && iface.address.startsWith('192.168')) {
                return `${iface.address.substring(0, iface.address.lastIndexOf('.'))}.0/24`;
            }
        }
    }
    return '192.168.0.0/24';
}

function identifyVendor(mac) {
    if (!mac) return 'Desconhecido';
    return MAC_VENDORS[mac.substring(0, 8).toLowerCase()] || 'Genérico';
}

async function getDirRecursive(dirPath, currentDepth = 0) {
    if (currentDepth > 2) return [];
    try {
        const dirents = await fs.promises.readdir(dirPath, { withFileTypes: true });
        return Promise.all(dirents.map(async (dirent) => {
            const fullPath = path.join(dirPath, dirent.name);
            const node = { id: fullPath, name: dirent.name, path: fullPath, type: dirent.isDirectory() ? 'folder' : 'file' };
            if (dirent.isDirectory()) node.children = await getDirRecursive(fullPath, currentDepth + 1);
            return node;
        }));
    } catch { return []; }
}

// --- API ROUTES ---

// 1. PLAYBACK & THUMBNAILS
app.get('/api/playback/:cam/:file', (req, res) => {
    const config = jsonDb.read('config.json', DEFAULTS.config);
    const { cam, file } = req.params;
    
    // Security sanitization
    const safeCam = sanitize(cam);
    const safeFile = path.basename(file);
    
    const filePath = path.join(config.recordingPath, safeCam, safeFile);
    
    if (!fs.existsSync(filePath)) return res.status(404).send('File not found');
    res.sendFile(filePath);
});

app.get('/api/playback/:cam/:file/thumb', (req, res) => {
    const config = jsonDb.read('config.json', DEFAULTS.config);
    const { cam, file } = req.params;
    
    const safeCam = sanitize(cam);
    const safeFile = path.basename(file);
    const videoPath = path.join(config.recordingPath, safeCam, safeFile);
    const thumbPath = path.join(config.recordingPath, safeCam, safeFile + '.jpg');

    if (fs.existsSync(thumbPath)) {
        return res.sendFile(thumbPath);
    } 
    
    if (fs.existsSync(videoPath)) {
        // Generate thumb on the fly
        exec(`ffmpeg -i "${videoPath}" -ss 00:00:01 -vframes 1 "${thumbPath}"`, (err) => {
            if (!err && fs.existsSync(thumbPath)) res.sendFile(thumbPath);
            else res.status(500).send('Generating...');
        });
    } else {
        res.status(404).send('Video not found');
    }
});


// 2. CAMERAS
app.get('/api/cameras', (req, res) => res.json(jsonDb.read('cameras.json', DEFAULTS.cameras)));
app.post('/api/cameras', (req, res) => {
    const oldCams = jsonDb.read('cameras.json', []);
    const newCams = req.body;
    
    newCams.forEach(newCam => {
        const oldCam = oldCams.find(c => c.id === newCam.id);
        if (!oldCam || oldCam.streamUrl !== newCam.streamUrl || newCam.status !== oldCam.status) {
            startRecording(newCam);
        }
    });
    
    oldCams.forEach(oldCam => {
        if (!newCams.find(c => c.id === oldCam.id)) stopRecording(oldCam.id);
    });

    jsonDb.write('cameras.json', newCams);
    res.json({ success: true });
});

// 3. RECORDINGS LIST
app.get('/api/recordings', async (req, res) => {
    const config = jsonDb.read('config.json', DEFAULTS.config);
    const recordings = [];
    const recPath = config.recordingPath;

    if (!fs.existsSync(recPath)) return res.json([]);

    try {
        const camFolders = await fs.promises.readdir(recPath, { withFileTypes: true });
        for (const folder of camFolders) {
            if (!folder.isDirectory()) continue;
            
            const folderPath = path.join(recPath, folder.name);
            const files = await fs.promises.readdir(folderPath);
            
            for (const file of files) {
                if (!file.endsWith('.mp4')) continue;
                
                const stat = fs.statSync(path.join(folderPath, file));
                
                recordings.push({
                    id: file,
                    cameraId: folder.name, 
                    cameraName: folder.name.replace(/_/g, ' ').toUpperCase(),
                    timestamp: stat.birthtime,
                    // URL scheme: /api/playback/<folder>/<filename>
                    videoUrl: `/api/playback/${folder.name}/${file}`,
                    thumbnailUrl: `/api/playback/${folder.name}/${file}/thumb`,
                    type: 'video',
                    aiTags: [],
                    size: (stat.size / (1024*1024)).toFixed(1) + ' MB'
                });
            }
        }
        recordings.sort((a, b) => b.timestamp - a.timestamp);
        res.json(recordings);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to scan recordings' });
    }
});

// Config & Users
app.get('/api/users', (req, res) => res.json(jsonDb.read('users.json', DEFAULTS.users)));
app.post('/api/users', (req, res) => { jsonDb.write('users.json', req.body); res.json({success:true}); });
app.get('/api/config', (req, res) => res.json(jsonDb.read('config.json', DEFAULTS.config)));
app.post('/api/config', (req, res) => { 
    jsonDb.write('config.json', { ...jsonDb.read('config.json', DEFAULTS.config), ...req.body }); 
    if (req.body.recordingPath) initializeRecorder();
    res.json({success:true}); 
});

// Proxy
app.get('/api/proxy', async (req, res) => {
    try {
        const { url, username, password } = req.query;
        if (!url) throw new Error("URL missing");
        
        const headers = {};
        if (username) headers['Authorization'] = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
        
        const response = await fetch(url, { headers, signal: AbortSignal.timeout(5000) });
        if (!response.ok) throw new Error(`Cam returned ${response.status}`);
        
        const buf = await response.arrayBuffer();
        res.set('Content-Type', response.headers.get('content-type') || 'image/jpeg');
        res.send(Buffer.from(buf));
    } catch (e) {
        res.status(502).send(e.message);
    }
});

app.get('/api/rtsp-snapshot', (req, res) => {
    let { url } = req.query;
    if (!url) return res.status(400).send('RTSP URL missing');
    const ffmpeg = spawn('ffmpeg', ['-y', '-rtsp_transport', 'tcp', '-i', url, '-f', 'image2', '-vframes', '1', '-q:v', '5', '-']);
    res.contentType('image/jpeg');
    ffmpeg.stdout.pipe(res);
});

// Storage
app.get('/api/storage/tree', async (req, res) => {
    res.json({ id: 'root', name: 'mnt', type: 'folder', path: '/mnt', children: await getDirRecursive('/mnt'), isOpen: true });
});
app.post('/api/storage/format', async (req, res) => {
    const { path: p } = req.body;
    if (!p || p === '/') return res.status(403).json({error: "Invalid path"});
    try {
        await fs.promises.rm(p, { recursive: true, force: true });
        await fs.promises.mkdir(p, { recursive: true });
        res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// Scan
app.get('/api/scan', (req, res) => {
    const subnet = req.query.subnet || getLocalNetwork();
    console.log(`Scanning ${subnet}...`);
    exec(`nmap -sn ${subnet}`, { timeout: 20000 }, (err, stdout) => {
        const devices = [];
        const lines = stdout.split('\n');
        let currentIp = null;
        
        lines.forEach(line => {
             if(line.includes('Nmap scan report')) currentIp = line.split(' ').pop().replace(/[()]/g, '');
             else if(line.includes('MAC Address') && currentIp) {
                 const mac = line.split('MAC Address: ')[1].split(' ')[0];
                 devices.push({ ip: currentIp, mac, manufacturer: identifyVendor(mac), model: 'Network Cam', isAdded: false });
                 currentIp = null;
             }
        });
        res.json(devices);
    });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    initializeRecorder(); // Start NVR
});

server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} in use. Kill process using 'sudo lsof -i :${PORT}'`);
        process.exit(1);
    }
});