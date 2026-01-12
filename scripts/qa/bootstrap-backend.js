#!/usr/bin/env node

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const pidFile = path.join(__dirname, '../../.qa-backend.pid');

// Start backend in background using stable QA command
const backend = spawn('npm', ['run', 'start:backend:qa'], {
    detached: true,
    stdio: 'ignore',
    env: {
        ...process.env,
        PORT: '3001',
        FRONTEND_ORIGINS: 'http://localhost:3000,http://localhost:3003'
    }
});

backend.unref();

// Save PID
fs.writeFileSync(pidFile, backend.pid.toString());

console.log(`Backend started with PID ${backend.pid}`);
console.log('Waiting 5 seconds for backend to initialize...');

setTimeout(() => {
    console.log('Backend should now be listening on port 3001');
    console.log('Run "npm run qa:status-backend" to verify');
}, 5000);
