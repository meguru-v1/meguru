
import fs from 'fs';
import { createCanvas } from 'canvas';

// Helper to create icon
function createIcon(size, color, text) {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, size, size);

    // Text
    ctx.fillStyle = 'white';
    ctx.font = `bold ${size / 2}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, size / 2, size / 2);

    return canvas.toBuffer('image/png');
}

// Generate 192x192
const icon192 = createIcon(192, '#F59E0B', 'M');
fs.writeFileSync('public/pwa-192x192.png', icon192);

// Generate 512x512 (Base)
const icon512 = createIcon(512, '#0F172A', 'M');
fs.writeFileSync('public/pwa-512x512.png', icon512);

// Generate Apple Touch Icon (same as 192x192 but no transparency if any - canvas handled)
// iOS adds rounded corners automatically, so square is fine.
const appleIcon = createIcon(180, '#0F172A', 'M');
fs.writeFileSync('public/apple-touch-icon.png', appleIcon);

// Generate Favicon (64x64 PNG for simplicity, usually browsers support png favicons)
const favicon = createIcon(64, '#0F172A', 'M');
fs.writeFileSync('public/favicon.ico', favicon); // Saving as .ico but it's really a PNG buffer, which modern browsers handle fine, or I should use a library to convert. 
// Actually, let's just save as favicon.svg for modern browsers, or use a simple PNG.
// For compatibility, let's just save a 32x32 PNG as favicon.png and update index.html to point to it, 
// or simpler: just write the 64x64 buffer to favicon.ico (it works in many cases) or favicon.png.

console.log('Icons (PWA, Apple, Favicon) generated successfully.');
