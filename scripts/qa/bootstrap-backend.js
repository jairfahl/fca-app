#!/usr/bin/env node

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const pidFile = '/tmp/fca_backend.pid';
const logFileVal = '/tmp/fca_backend.log';

// Ensure clean slate
if (fs.existsSync(pidFile)) {
    try {
        const pid = fs.readFileSync(pidFile, 'utf-8').trim();
        process.kill(parseInt(pid), 0); // Check if running
        console.error(`Error: Backend already running (PID ${pid}). Run teardown first.`);
        process.exit(1);
    } catch (e) {
        fs.unlinkSync(pidFile); // Stale PID file
    }
}

const logStream = fs.openSync(logFileVal, 'w');

const backend = spawn('npm', ['run', 'start:backend:qa'], {
    detached: true,
    stdio: ['ignore', logStream, logStream],
    env: {
        ...process.env,
        QA_MODE: 'true',
        PORT: '3001',
        FRONTEND_ORIGINS: 'http://localhost:3003',
        QA_JWT_SECRET: 'qa-secret-123'
    }
});

backend.unref();
fs.writeFileSync(pidFile, backend.pid.toString());

console.log(`PID written: ${backend.pid}`);

// Wait for READY
const start = Date.now();
const timeout = 15000;

const checkReady = setInterval(() => {
    try {
        const content = fs.readFileSync(logFileVal, 'utf-8');
        if (content.includes('READY')) {
            clearInterval(checkReady);
            console.log('Backend is READY.');
            try {
                const lsof = require('child_process').execSync('lsof -nP -iTCP:3001 -sTCP:LISTEN').toString();
                console.log(lsof.trim());
            } catch (e) {
                console.log('No LISTEN on 3001 found (yet?)');
            }
            const logs = content.split('\n').slice(0, 30).join('\n');
            console.log('--- LOG HEAD ---');
            console.log(logs);
            process.exit(0);
        }

        if (Date.now() - start > timeout) {
            clearInterval(checkReady);
            console.error('Timeout waiting for READY.');
            const logs = content.split('\n').slice(-80).join('\n');
            console.log('--- LOG TAIL ---');
            console.log(logs);
            process.exit(1);
        }
    } catch (e) {
        // File might not exist yet
    }
}, 500);
