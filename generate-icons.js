
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

// Generate 512x512
const icon512 = createIcon(512, '#0F172A', 'M');
fs.writeFileSync('public/pwa-512x512.png', icon512);

console.log('Icons generated successfully.');
