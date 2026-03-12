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

const MODELS_TO_TEST = [
    "gemini-2.5-pro",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.0-flash",
    "gemini-1.5-pro",
    "gemini-1.5-flash",
    "gemini-1.5-flash-latest",
    "gemini-1.5-pro-latest"
];

async function testModel(modelName) {
    return new Promise((resolve) => {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${API_KEY}`;
        const data = JSON.stringify({
            contents: [{ parts: [{ text: "Hi" }] }]
        });

        const req = https.request(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                resolve({ model: modelName, status: res.statusCode, body: body.substring(0, 100) });
            });
        });

        req.on('error', (e) => resolve({ model: modelName, status: 'Error', body: e.message }));
        req.write(data);
        req.end();
    });
}

async function run() {
    console.log("Testing model availability...");
    for (const m of MODELS_TO_TEST) {
        const res = await testModel(m);
        console.log(`- ${m}: Status ${res.status}`);
        if (res.status !== 200) {
            try {
                const json = JSON.parse(res.body + (res.body.endsWith('}') ? '' : '}'));
                console.log(`  Reason: ${json.error?.message || 'Unknown'}`);
            } catch(e) {
                console.log(`  Body: ${res.body}`);
            }
        }
    }
}

run();
