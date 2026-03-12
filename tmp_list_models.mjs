import https from 'https';
import fs from 'fs';

let API_KEY = "";
try {
    const envFile = fs.readFileSync('.env', 'utf8');
    const match = envFile.match(/VITE_GEMINI_API_KEY=(.+)/);
    if (match) {
        API_KEY = match[1].trim();
    }
} catch (e) {
    console.log("Could not read .env");
}

if (!API_KEY) {
    console.error("No VITE_GEMINI_API_KEY found in .env");
    process.exit(1);
}

function listModels() {
    return new Promise((resolve, reject) => {
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`;
        
        https.get(url, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    resolve(JSON.parse(body));
                } else {
                    reject(new Error(`Status ${res.statusCode}: ${body}`));
                }
            });
        }).on('error', reject);
    });
}

async function run() {
    try {
        const result = await listModels();
        console.log("Available Gemini Models (v1beta):");
        result.models.forEach(m => {
            if (m.supportedGenerationMethods.includes('generateContent')) {
                console.log(`- ${m.name.replace('models/', '')} (${m.displayName})`);
            }
        });
    } catch (e) {
        console.error("Error listing models:", e.message);
    }
}

run();
