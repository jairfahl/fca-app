#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');

const pidFile = '/tmp/fca_backend.pid';

try {
    if (fs.existsSync(pidFile)) {
        const pid = fs.readFileSync(pidFile, 'utf-8').trim();
        try {
            execSync(`kill -9 ${pid} 2>/dev/null`);
        } catch (e) { }
        fs.unlinkSync(pidFile);
    }

    // Kill any residual on 3001
    try {
        const residual = execSync('lsof -t -iTCP:3001 -sTCP:LISTEN').toString().trim();
        if (residual) {
            execSync(`kill -9 ${residual} 2>/dev/null`);
        }
    } catch (e) { }

    // Verify
    try {
        execSync('lsof -nP -iTCP:3001 -sTCP:LISTEN');
        console.error('Port 3001 still in use!');
        process.exit(1);
    } catch (e) {
        console.log('Port 3001 free.');
    }
} catch (e) {
    console.error(e);
    process.exit(1);
}
