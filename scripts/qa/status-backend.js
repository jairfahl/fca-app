#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');

const pidFile = '/tmp/fca_backend.pid';
const logFile = '/tmp/fca_backend.log';

// 1. PID File
if (fs.existsSync(pidFile)) {
    console.log(`PID: ${fs.readFileSync(pidFile, 'utf-8').trim()}`);
} else {
    console.log('NO PID FILE');
}

// 2. LSOF
try {
    const lsof = execSync('lsof -nP -iTCP:3001 -sTCP:LISTEN').toString().trim();
    console.log(lsof);
} catch (e) {
    console.log('NO LISTENERS');
}

// 3. Log Tail
if (fs.existsSync(logFile)) {
    const content = fs.readFileSync(logFile, 'utf-8').split('\n').slice(0, 60).join('\n');
    console.log(content);
} else {
    console.log('NO LOG FILE');
}
