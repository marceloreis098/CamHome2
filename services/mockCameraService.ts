import { Camera, CameraStatus, StorageStats, RecordedMedia, FileNode, SystemConfig, AccessLog, SystemNotification, NotificationLevel, User, DiscoveredDevice } from '../types';

// --- HELPERS ---
const smartFetch = async (endpoint: string, options: RequestInit = {}) => {
    const isDev = process.env.NODE_ENV === 'development' || window.location.port === '1234';
    let url = endpoint;
    if (isDev) url = `http://${window.location.hostname}:3000${endpoint}`;

    if (options.body && !options.headers) options.headers = { 'Content-Type': 'application/json' };

    try {
        const res = await fetch(url, options);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        try { return JSON.parse(text); } catch { return text; }
    } catch (e) {
        console.error(`Fetch error ${url}:`, e);
        throw e;
    }
};

export const checkBackendHealth = async () => {
    try { await smartFetch('/api/config'); return true; } catch { return false; }
};

// --- CRUD ---
export const fetchCameras = async (): Promise<Camera[]> => {
    try {
        const data = await smartFetch('/api/cameras');
        if (Array.isArray(data)) {
            return data;
        }
        console.warn('API call to /api/cameras did not return an array. Response:', data);
        return [];
    } catch (e) {
        console.error("Failed to fetch cameras:", e);
        return [];
    }
};
export const addCamera = async (c: Camera) => {
    const list = await fetchCameras();
    list.push(c);
    await smartFetch('/api/cameras', { method: 'POST', body: JSON.stringify(list) });
};
export const updateCamera = async (c: Camera) => {
    const list = await fetchCameras();
    const idx = list.findIndex((x: Camera) => x.id === c.id);
    if(idx !== -1) list[idx] = c;
    await smartFetch('/api/cameras', { method: 'POST', body: JSON.stringify(list) });
};
export const deleteCamera = async (id: string) => {
    let list = await fetchCameras();
    list = list.filter((x: Camera) => x.id !== id);
    await smartFetch('/api/cameras', { method: 'POST', body: JSON.stringify(list) });
};

export const fetchUsers = async (): Promise<User[]> => {
    try {
        const data = await smartFetch('/api/users');
        if (Array.isArray(data)) {
            return data;
        }
        console.warn('API call to /api/users did not return an array. Response:', data);
        return [];
    } catch (e) {
        console.error("Failed to fetch users:", e);
        return [];
    }
};
export const saveUser = async (u: User) => {
    const list = await fetchUsers();
    const idx = list.findIndex((x: User) => x.id === u.id);
    if(idx !== -1) list[idx] = u; else list.push(u);
    await smartFetch('/api/users', { method: 'POST', body: JSON.stringify(list) });
};
export const deleteUser = async (id: string) => {
    let list = await fetchUsers();
    list = list.filter((x: User) => x.id !== id);
    await smartFetch('/api/users', { method: 'POST', body: JSON.stringify(list) });
};
export const authenticateUser = async (u: string, p: string) => {
    const list = await fetchUsers();
    return list.find((x: User) => x.username === u && x.password === p) || null;
};

export const fetchSystemConfig = async (): Promise<SystemConfig | null> => {
    try {
        const data = await smartFetch('/api/config');
        if (data && typeof data === 'object' && !Array.isArray(data)) {
            return data as SystemConfig;
        }
        console.warn('API call to /api/config did not return an object. Response:', data);
        return null;
    } catch (e) {
        console.error("Failed to fetch system config:", e);
        return null;
    }
};
export const updateSystemConfig = (c: SystemConfig) => smartFetch('/api/config', { method: 'POST', body: JSON.stringify(c) });

// --- FEATURES ---
export const scanNetworkForDevices = async (subnet?: string): Promise<DiscoveredDevice[]> => {
    const query = subnet ? `?subnet=${subnet}` : '';
    let devices: DiscoveredDevice[] = [];
    try {
        const data = await smartFetch(`/api/scan${query}`);
        if (Array.isArray(data)) {
            devices = data;
        } else {
            console.warn('API call to /api/scan did not return an array. Response:', data);
        }
    } catch (e) {
        console.error("Failed to scan network:", e);
    }
    
    const cams = await fetchCameras();
    return devices.map(d => ({ ...d, isAdded: cams.some((c: Camera) => c.ip === d.ip) }));
};

// REAL RECORDINGS FROM DISK
export const fetchRecordings = async (): Promise<RecordedMedia[]> => {
    try {
        const data = await smartFetch('/api/recordings');
        if (Array.isArray(data)) {
            // Convert timestamps back to Date objects
            return data.map((d: any) => ({
                ...d,
                timestamp: new Date(d.timestamp)
            }));
        }
        return [];
    } catch (e) {
        console.error("Failed to load recordings", e);
        return [];
    }
};

export const fetchStorageStats = async () => {
    const conf = await fetchSystemConfig();
    return { total: 1000, used: 0, path: conf?.recordingPath || '/mnt/', label: 'Disk', isMounted: true };
};
export const formatStorage = (path: string) => smartFetch('/api/storage/format', { method: 'POST', body: JSON.stringify({path}) });
export const fetchFileSystem = () => smartFetch('/api/storage/tree');

// Mocks
export const logAccessAttempt = (username: string, success: boolean, method: string) => {};
export const fetchNotifications = async (): Promise<SystemNotification[]> => [];
export const markNotificationRead = (id: string) => {};
export const fetchAccessLogs = async () => [];