import https from 'https';
import fs from 'fs';

let API_KEY = "";
try {
    const envFile = fs.readFileSync('.env', 'utf8');
    const match = envFile.match(/VITE_GOOGLE_MAPS_API_KEY=(.+)/);
    if (match) {
        API_KEY = match[1].trim();
    }
} catch (e) {
    console.log("Could not read .env");
}

if (!API_KEY) {
    console.error("No VITE_GOOGLE_MAPS_API_KEY found in .env");
    process.exit(1);
}

const testPlacesAPI = (referer) => {
    return new Promise((resolve, reject) => {
        const url = `https://places.googleapis.com/v1/places:searchText`;
        const data = JSON.stringify({
            textQuery: "Kyoto Tower"
        });

        const headers = {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': API_KEY,
            'X-Goog-FieldMask': 'places.id,places.displayName'
        };

        if (referer) {
            headers['Referer'] = referer;
        }

        const req = https.request(url, {
            method: 'POST',
            headers: headers
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                resolve({ referer: referer || 'NONE', status: res.statusCode, body });
            });
        });

        req.on('error', reject);
        req.write(data);
        req.end();
    });
};

async function runTests() {
    console.log("Using API Key starting with: " + API_KEY.substring(0, 10) + "...");
    console.log("1. Testing WITHOUT Referer (Should be blocked if restrictions are strict):");
    const res1 = await testPlacesAPI(null);
    console.log(`Status: ${res1.status}`);
    if (res1.status !== 200) console.log(res1.body);

    console.log("\n2. Testing WITH Localhost Referer (Should succeed):");
    const res2 = await testPlacesAPI('http://localhost:5173/');
    console.log(`Status: ${res2.status}`);
    if (res2.status === 200) console.log("Success! Places API responded.");
    else console.log(res2.body);

    console.log("\n3. Testing WITH GitHub Pages Referer (Should succeed):");
    const res3 = await testPlacesAPI('https://gaku27.github.io/meguru/');
    console.log(`Status: ${res3.status}`);
    if (res3.status === 200) console.log("Success! Places API responded.");
    else console.log(res3.body);
}

runTests();
