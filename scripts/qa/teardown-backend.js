#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const pidFile = path.join(__dirname, '../../.qa-backend.pid');

try {
    // Kill process from PID file if exists
    if (fs.existsSync(pidFile)) {
        const pid = fs.readFileSync(pidFile, 'utf-8').trim();
        console.log(`Killing process ${pid} from PID file...`);
        try {
            execSync(`kill -9 ${pid} 2>/dev/null || true`);
        } catch (e) {
            // Process may already be dead
        }
        fs.unlinkSync(pidFile);
    }

    // Kill any process listening on port 3001
    const result = execSync('lsof -t -iTCP:3001 -sTCP:LISTEN 2>/dev/null || true', { encoding: 'utf-8' });
    const pids = result.trim().split('\n').filter(p => p);

    if (pids.length > 0) {
        console.log(`Killing ${pids.length} process(es) listening on port 3001:`, pids.join(', '));
        pids.forEach(pid => {
            try {
                execSync(`kill -9 ${pid} 2>/dev/null || true`);
            } catch (e) {
                // Ignore errors
            }
        });
    } else {
        console.log('No processes listening on port 3001');
    }

    console.log('Backend teardown complete');
} catch (error) {
    console.error('Error during teardown:', error.message);
    process.exit(1);
}
