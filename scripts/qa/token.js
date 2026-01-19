#!/usr/bin/env node

if (process.env.QA_MODE !== 'true') {
    console.error('QA_MODE must be true');
    process.exit(1);
}

if (process.env.NODE_ENV === 'production') {
    console.error('QA token forbidden in production');
    process.exit(1);
}

const http = require('http');

const options = {
    hostname: '127.0.0.1',
    port: 3001,
    path: '/api/__qa/token',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    }
};

const req = http.request(options, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
                const json = JSON.parse(data);
                console.log(json.access_token);
            } catch (e) {
                process.exit(1);
            }
        } else {
            process.exit(1);
        }
    });
});

req.on('error', (e) => {
    process.exit(1);
});

req.end();
