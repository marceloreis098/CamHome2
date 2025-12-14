const express = require('express');
const path = require('path');
const { exec, spawn } = require('child_process');
const os = require('os');
const fs = require('fs');
const http = require('http');

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

// --- GLOBAL STATE ---
let IS_FFMPEG_INSTALLED = false;

// Check FFMPEG at startup
exec('ffmpeg -version', (err) => {
    if (err) {
        console.warn("⚠️  FFMPEG NOT FOUND! Recording and RTSP Snapshots will not work.");
        console.warn("👉 Install it: sudo apt install ffmpeg");
        IS_FFMPEG_INSTALLED = false;
    } else {
        console.log("✅ FFMPEG Detected. Video features enabled.");
        IS_FFMPEG_INSTALLED = true;
    }
});

// --- DATA PERSISTENCE LAYER ---
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const jsonDb = {
    read: (filename, defaultValue) => {
        const filePath = path.join(DATA_DIR, filename);
        if (!fs.existsSync(filePath)) {
            try {
                fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2));
            } catch (e) {
                console.error(`Error creating ${filename}:`, e);
            }
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
    if (!IS_FFMPEG_INSTALLED) return; // Skip if no ffmpeg

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

    try {
        const proc = spawn('ffmpeg', args);

        proc.on('error', (err) => {
            console.error(`[NVR] Error spawning ffmpeg for ${camera.name}: ${err.message}`);
            delete recorders[camera.id];
        });

        recorders[camera.id] = {
            process: proc,
            startTime: Date.now()
        };

        proc.on('close', (code) => {
            console.log(`[NVR] Recording stopped for ${camera.name} (Code ${code})`);
            delete recorders[camera.id];
            
            // Restart logic: Only restart if it ran for more than 10 seconds (avoid crash loops)
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
    } catch (e) {
        console.error(`[NVR] Exception spawning ffmpeg: ${e.message}`);
    }
}

function stopRecording(cameraId) {
    if (recorders[cameraId]) {
        if(recorders[cameraId].process) {
            try {
                recorders[cameraId].process.kill('SIGTERM'); 
            } catch(e) { /* ignore */ }
        }
        delete recorders[cameraId];
    }
}

function initializeRecorder() {
    if (!IS_FFMPEG_INSTALLED) {
        console.log("[NVR] Recorder skipped (FFMPEG missing)");
        return;
    }
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

// 1. PLAYBACK
app.get('/api/playback/:cam/:file', (req, res) => {
    const config = jsonDb.read('config.json', DEFAULTS.config);
    const { cam, file } = req.params;
    const filePath = path.join(config.recordingPath, sanitize(cam), path.basename(file));
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

    if (fs.existsSync(thumbPath)) return res.sendFile(thumbPath);
    
    if (fs.existsSync(videoPath) && IS_FFMPEG_INSTALLED) {
        exec(`ffmpeg -i "${videoPath}" -ss 00:00:01 -vframes 1 "${thumbPath}"`, (err) => {
            if (!err && fs.existsSync(thumbPath)) res.sendFile(thumbPath);
            else res.status(500).send('Generating failed');
        });
    } else {
        res.status(404).send('Not found');
    }
});


// 2. CAMERAS CRUD
app.get('/api/cameras', (req, res) => res.json(jsonDb.read('cameras.json', DEFAULTS.cameras)));
app.post('/api/cameras', (req, res) => {
    const oldCams = jsonDb.read('cameras.json', []);
    const newCams = req.body;
    
    // Logic to restart recorders if URLs changed
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

// 3. RECORDINGS
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

// Config API
app.get('/api/users', (req, res) => res.json(jsonDb.read('users.json', DEFAULTS.users)));
app.post('/api/users', (req, res) => { jsonDb.write('users.json', req.body); res.json({success:true}); });
app.get('/api/config', (req, res) => res.json(jsonDb.read('config.json', DEFAULTS.config)));
app.post('/api/config', (req, res) => { 
    jsonDb.write('config.json', { ...jsonDb.read('config.json', DEFAULTS.config), ...req.body }); 
    if (req.body.recordingPath) initializeRecorder();
    res.json({success:true}); 
});

// --- HYBRID PROXY: FETCH -> Fallback to FFMPEG (Robust Auth) ---
app.get('/api/proxy', async (req, res) => {
    try {
        const { url, username, password } = req.query;
        if (!url) throw new Error("URL missing");
        
        // 1. Try Standard HTTP Fetch first (Low latency)
        // We use a short timeout because if it hangs, we want to fallback to FFMPEG quickly.
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000); // 3s timeout

        const headers = {};
        // Basic Auth Header
        if (username && password) {
            headers['Authorization'] = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
        }

        try {
            const response = await fetch(url, { 
                headers, 
                signal: controller.signal 
            });
            clearTimeout(timeoutId);

            if (response.ok) {
                const buf = await response.arrayBuffer();
                res.set('Content-Type', response.headers.get('content-type') || 'image/jpeg');
                return res.send(Buffer.from(buf));
            }
            
            // If we get here, response is not OK (e.g. 401 Unauthorized, 500, etc)
            // If it's a 4xx/5xx, we might want to try FFMPEG as it handles Digest Auth and other quirks better.
            console.warn(`[Proxy] Direct fetch failed (${response.status}), attempting fallback...`);

        } catch (fetchError) {
            clearTimeout(timeoutId);
            console.warn(`[Proxy] Direct fetch exception: ${fetchError.message}, attempting fallback...`);
        }

        // 2. FFMPEG Fallback (High compatibility)
        // Use FFMPEG to grab the frame. It handles Digest Auth, redirections, and broken headers well.
        if (IS_FFMPEG_INSTALLED) {
            // Embed credentials in URL for FFMPEG
            let authUrl = url;
            if (username && password) {
                try {
                    // Inject into URL object to handle encoding safely
                    const urlObj = new URL(url);
                    // Only set if not already present to avoid overriding
                    if (!urlObj.username) urlObj.username = username;
                    if (!urlObj.password) urlObj.password = password;
                    authUrl = urlObj.toString();
                } catch (e) {
                    // Fallback to simple string replacement if URL parsing fails (unlikely)
                    authUrl = url.replace('://', `://${username}:${password}@`);
                }
            }

            const args = [
                '-y',
                '-hide_banner', '-loglevel', 'error',
                '-stimeout', '5000000', // 5s timeout
                '-i', authUrl,
                '-frames:v', '1',
                '-f', 'image2',
                '-update', '1',
                '-' // Output to pipe
            ];

            const ffmpeg = spawn('ffmpeg', args);
            
            // Pipe FFMPEG stdout directly to response
            res.contentType('image/jpeg');
            ffmpeg.stdout.pipe(res);

            ffmpeg.on('error', (err) => {
                console.error('[Proxy] FFMPEG Fallback Error:', err);
                if(!res.headersSent) res.status(502).send("Proxy failed (FFMPEG Error)");
            });

            ffmpeg.stderr.on('data', d => {
                // FFMPEG stderr output (errors/warnings)
                // console.log(`[FFMPEG Proxy Log] ${d}`);
            });
            
            return;
        }

        // If we reached here: Fetch failed AND FFMPEG is not installed.
        res.status(502).send("Proxy failed: Could not connect to camera and FFMPEG is missing.");

    } catch (e) {
        console.error(`[Proxy Fatal] ${e.message}`);
        if(!res.headersSent) res.status(500).send(e.message);
    }
});

// --- SAFE RTSP SNAPSHOT ---
app.get('/api/rtsp-snapshot', (req, res) => {
    if (!IS_FFMPEG_INSTALLED) return res.status(503).send("FFMPEG Missing");

    let { url } = req.query;
    if (!url) return res.status(400).send('RTSP URL missing');

    const args = [
        '-y',
        '-stimeout', '5000000', // 5s timeout for connection
        '-rtsp_transport', 'tcp', // Force TCP for reliability
        '-i', url,
        '-f', 'image2',
        '-vframes', '1',
        '-s', '640x360', // Downscale for performance
        '-q:v', '15',    // Lower quality for speed (1-31)
        '-' 
    ];

    const ffmpeg = spawn('ffmpeg', args);
    
    // Pipe directly for lower latency / memory usage
    res.contentType('image/jpeg');
    ffmpeg.stdout.pipe(res);

    ffmpeg.on('error', (err) => {
        console.error('[Snapshot] FFMPEG Spawn Error:', err);
        if(!res.headersSent) res.status(502).send("Snapshot failed");
    });
});

// Storage Utils
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
    exec(`nmap -sn ${subnet}`, { timeout: 20000 }, (err, stdout) => {
        if (err) return res.json([]);
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
    // Delay initialization
    setTimeout(initializeRecorder, 2000);
});

server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} in use.`);
        process.exit(1);
    }
});