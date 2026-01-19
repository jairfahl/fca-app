import 'dotenv/config'
import { createServer } from './server'

const PORT = process.env.PORT || 3000

const app = createServer()

// Startup Proof
try {
    const commitHash = require('child_process').execSync('git rev-parse HEAD').toString().trim();
    console.log(`SERVER STARTUP: COMMIT_HASH=${commitHash}`);
} catch (e) {
    console.log('SERVER STARTUP: COMMIT_HASH=UNKNOWN');
}

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
    console.log('READY')
})
