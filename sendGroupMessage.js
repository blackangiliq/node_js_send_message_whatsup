const express = require('express');
const qrcode = require('qrcode-terminal');
const { Client, LocalAuth } = require('whatsapp-web.js');
const fs = require('fs');
const path = require('path');
const app = express();
const port = 3000;

// Store active sessions
const sessions = new Map();
const SESSION_DIR = path.join(__dirname, 'sessions');

// Ensure sessions directory exists
if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR);
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Utility functions for message sending
const randomDelay = async (minMs = 500, maxMs = 2000) => {
    const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    return new Promise(resolve => setTimeout(resolve, delay));
};

const simulateTyping = async (chat, text) => {
    try {
        await chat.sendStateTyping();
        await randomDelay(text.length * 100, text.length * 200);
        await chat.clearState();
        await randomDelay(300, 800);
    } catch (error) {
        console.error('Error simulating typing:', error);
    }
};

// Session Manager Class
class SessionManager {
    static async loadSavedSessions() {
        try {
            const sessionFile = path.join(SESSION_DIR, 'sessions.json');
            if (fs.existsSync(sessionFile)) {
                const savedSessions = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
                console.log('Found saved sessions:', savedSessions.length);
                return savedSessions;
            }
            return [];
        } catch (error) {
            console.error('Error loading saved sessions:', error);
            return [];
        }
    }

    static async saveSessions() {
        try {
            const sessionData = Array.from(sessions.entries()).map(([id, session]) => ({
                id,
                webhookUrl: session.webhookUrl,
                status: session.status
            }));
            fs.writeFileSync(
                path.join(SESSION_DIR, 'sessions.json'),
                JSON.stringify(sessionData, null, 2)
            );
        } catch (error) {
            console.error('Error saving sessions:', error);
        }
    }

    static async restoreSession(sessionId, webhookUrl = null) {
        try {
            console.log(`Restoring session ${sessionId}...`);
            return await this.createSession(sessionId, webhookUrl, true);
        } catch (error) {
            console.error(`Error restoring session ${sessionId}:`, error);
            return null;
        }
    }

    static getActiveSessions() {
        return Array.from(sessions.keys()).map(id => ({
            id,
            status: sessions.get(id).status || 'unknown',
            webhookUrl: sessions.get(id).webhookUrl
        }));
    }

    static async createSession(sessionId, webhookUrl = null, isRestoring = false) {
        if (sessions.has(sessionId)) {
            const existingSession = sessions.get(sessionId);
            if (existingSession.status === 'READY') {
                return { session: existingSession };
            }
        }

        return new Promise((resolve, reject) => {
            let qrCodeData = null;
            let timeoutId = null;

            const client = new Client({
                authStrategy: new LocalAuth({
                    clientId: sessionId,
                    dataPath: path.join(SESSION_DIR, sessionId)
                }),
                puppeteer: {
                    headless: false,
                    args: ['--no-sandbox', '--disable-setuid-sandbox']
                }
            });

            const session = {
                client,
                status: 'INITIALIZING',
                qrCode: null,
                webhookUrl,
                lastActive: Date.now(),
                isInitialized: false
            };

            // Set timeout for QR code generation
            timeoutId = setTimeout(() => {
                reject(new Error('QR Code generation timeout'));
            }, 30000); // 30 seconds timeout

            client.on('qr', (qr) => {
                session.qrCode = qr;
                session.status = 'WAITING_FOR_SCAN';
                qrCodeData = qr;
                clearTimeout(timeoutId);
                resolve({ session, qrCode: qr });
            });

            client.on('ready', () => {
                session.status = 'READY';
                session.isInitialized = true;
                session.lastActive = Date.now();
                console.log(`Session ${sessionId} is ready!`);
                if (qrCodeData === null) {
                    // If we haven't resolved with QR code, resolve with ready session
                    clearTimeout(timeoutId);
                    resolve({ session });
                }
                this.saveSessions();
            });

            client.on('authenticated', () => {
                session.status = 'AUTHENTICATED';
                session.lastActive = Date.now();
                this.saveSessions();
            });

            client.on('auth_failure', () => {
                session.status = 'AUTH_FAILED';
                this.saveSessions();
            });

            client.on('disconnected', async () => {
                session.status = 'DISCONNECTED';
                session.isInitialized = false;
                this.saveSessions();
                
                if (!isRestoring) {
                    console.log(`Attempting to reconnect session ${sessionId}...`);
                    setTimeout(() => {
                        client.initialize().catch(console.error);
                    }, 5000);
                }
            });

            sessions.set(sessionId, session);
            client.initialize().catch(reject);
        });
    }


    static async deleteSession(sessionId) {
        if (!sessions.has(sessionId)) {
            throw new Error('Session not found');
        }

        const session = sessions.get(sessionId);
        await session.client.destroy();
        sessions.delete(sessionId);
        
        const sessionPath = path.join(SESSION_DIR, sessionId);
        if (fs.existsSync(sessionPath)) {
            fs.rmSync(sessionPath, { recursive: true, force: true });
        }
        
        await this.saveSessions();
    }

    static async waitForSessionReady(session, maxWaitTime = 30000) {
        const startTime = Date.now();
        while (Date.now() - startTime < maxWaitTime) {
            if (session.status === 'READY' && session.isInitialized) {
                return true;
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        return false;
    }
}

// Enhanced Middleware
const sessionMiddleware = async (req, res, next) => {
    const sessionId = req.query.session;
    if (!sessionId) {
        return res.status(400).json({
            status: 'error',
            message: 'Session ID is required'
        });
    }

    let session = sessions.get(sessionId);
    
    if (!session) {
        try {
            session = await SessionManager.restoreSession(sessionId);
            if (!session) {
                return res.status(404).json({
                    status: 'error',
                    message: 'Session not found and could not be restored'
                });
            }
        } catch (error) {
            return res.status(500).json({
                status: 'error',
                message: 'Error restoring session'
            });
        }
    }

    // Wait for session to be ready
    if (!session.isInitialized || session.status !== 'READY') {
        const isReady = await SessionManager.waitForSessionReady(session);
        if (!isReady) {
            return res.status(503).json({
                status: 'error',
                message: 'Session is not ready. Please try again later.'
            });
        }
    }

    session.lastActive = Date.now();
    req.whatsappSession = session;
    next();
};

// 1. Session Management Routes
app.get('/api/session/create', async (req, res) => {
    try {
        const { sessionId, webhookUrl } = req.query;
        if (!sessionId) {
            return res.status(400).json({
                status: 'error',
                message: 'Session ID is required'
            });
        }

        const { session, qrCode } = await SessionManager.createSession(sessionId, webhookUrl);
        
        const response = {
            status: 'success',
            message: 'Session created successfully',
            sessionId,
            sessionStatus: session.status
        };

        // Include QR code if available
        if (qrCode) {
            response.qrCode = qrCode;
        }

        res.json(response);
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
});
app.get('/api/session/status', sessionMiddleware, async (req, res) => {
    try {
        const session = req.whatsappSession;
        res.json({
            status: 'success',
            sessionStatus: {
                id: req.query.session,
                status: session.status,
                lastActive: session.lastActive,
                isReady: session.status === 'READY'
            }
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
});

app.get('/api/session/list', (req, res) => {
    try {
        const activeSessions = SessionManager.getActiveSessions();
        res.json({
            status: 'success',
            sessions: activeSessions
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
});

app.get('/api/session/delete', async (req, res) => {
    try {
        const { sessionId } = req.query;
        if (!sessionId) {
            return res.status(400).json({
                status: 'error',
                message: 'Session ID is required'
            });
        }

        await SessionManager.deleteSession(sessionId);
        res.json({
            status: 'success',
            message: 'Session deleted successfully'
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
});



// 3. Group Management Routes
app.get('/api/groups', sessionMiddleware, async (req, res) => {
    try {
        const client = req.whatsappSession.client;
        const chats = await client.getChats();
        const groups = await Promise.all(chats
            .filter(chat => chat.id.server === 'g.us')
            .map(async group => ({
                id: group.id._serialized,
                name: group.name,
                participants: (await group.participants || []).length,
                description: group.description || ''
            })));

        res.json({
            status: 'success',
            groups
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
});

app.get('/api/groups/info', sessionMiddleware, async (req, res) => {
    try {
        const { groupId } = req.query;
        const client = req.whatsappSession.client;
        
        if (!groupId) {
            return res.status(400).json({
                status: 'error',
                message: 'Group ID is required'
            });
        }

        const chat = await client.getChatById(groupId);

        if (!chat || chat.id.server !== 'g.us') {
            return res.status(404).json({
                status: 'error',
                message: 'Group not found'
            });
        }

        const participants = await chat.participants || [];
        
        res.json({
            status: 'success',
            group: {
                id: chat.id._serialized,
                name: chat.name,
                description: chat.description || '',
                participants: participants.map(p => ({
                    id: p.id._serialized,
                    isAdmin: p.isAdmin || false
                }))
            }
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
});

// 4. Status and Info Routes
app.get('/api/status', sessionMiddleware, async (req, res) => {
    try {
        const state = await req.whatsappSession.client.getState();
        res.json({
            status: 'success',
            whatsappStatus: state
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
});

app.get('/api/screenshot', sessionMiddleware, async (req, res) => {
    try {
        res.setHeader('Content-Type', 'image/jpeg');
        const screenshot = await req.whatsappSession.client.pupPage.screenshot({
            type: 'jpeg',
            quality: 80
        });
        res.send(screenshot);
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
});
//session
//http://localhost:3000/api/sendText?phone=phone&text=asdasd&session=default

app.get('/api/sendText/', sessionMiddleware, async (req, res) => {
    try {
        const { phone, text } = req.query;
        const client = req.whatsappSession.client;

        if (!phone || !text) {
            return res.status(400).json({
                status: 'error',
                message: 'Recipients and message are required'
            });
        }
        const chat = await client.getChatById(phone.includes('@g.us') ? phone : `${phone}@c.us`);
        // Simulate human behavior
        await randomDelay(1000, 2000);
        await simulateTyping(chat, text);
        
        const sentMessage = await chat.sendMessage(text);
        
        res.json({
            status: 'success',
            message: 'Message sent successfully',
            messageId: sentMessage.id._serialized
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
});

// Keep all other routes the same...

// Initialize server with lazy session loading
app.listen(port, () => {
    console.log(`WhatsApp API server running on port ${port}`);
    SessionManager.loadSavedSessions().then(savedSessions => {
        console.log(`Found ${savedSessions.length} saved sessions`);
    });
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down gracefully...');
    await SessionManager.saveSessions();
    process.exit(0);
});
