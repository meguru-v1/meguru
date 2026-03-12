
import fs from 'fs';
import { createCanvas } from 'canvas';

function createIcon(size, text) {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');

    // Gradient Background (Deep Amber/Orange)
    const gradient = ctx.createLinearGradient(0, 0, 0, size);
    gradient.addColorStop(0, '#fbbf24'); // Amber-400
    gradient.addColorStop(1, '#b45309'); // Amber-700

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    // --- Compass Symbol Design (No Text) ---
    const cx = size / 2;
    const cy = size / 2;
    const r = size * 0.35; // Ring radius

    // Outer Ring (White, translucent)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = size * 0.06;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    // Needle Drawing
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-Math.PI / 6); // 30 deg tilt

    const nLen = size * 0.38; // Needle length
    const nWid = size * 0.12; // Needle half-width at center

    // North (White/Light Silver) points UP relative to rotation
    ctx.beginPath();
    ctx.moveTo(0, -nLen);
    ctx.lineTo(nWid, 0);
    ctx.lineTo(0, 0);
    ctx.lineTo(-nWid, 0);
    ctx.closePath();
    ctx.fillStyle = '#f8fafc';
    ctx.fill();

    // South (Darker Silver/Grey) points DOWN
    ctx.beginPath();
    ctx.moveTo(0, nLen);
    ctx.lineTo(nWid, 0);
    ctx.lineTo(0, 0);
    ctx.lineTo(-nWid, 0);
    ctx.closePath();
    ctx.fillStyle = '#cbd5e1';
    ctx.fill();

    // Add 3D effect (shading on one side)
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.beginPath();
    ctx.moveTo(0, -nLen);
    ctx.lineTo(nWid, 0);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(0, nLen);
    ctx.lineTo(-nWid, 0);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fill();

    // Central Pivot
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.05, 0, Math.PI * 2);
    ctx.fillStyle = '#475569'; // Slate-600
    ctx.fill();

    ctx.restore();

    // Add subtle border glow/inner shadow to background
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = size * 0.02;
    ctx.strokeRect(0, 0, size, size);

    return canvas.toBuffer('image/png');
}

// Generate 192x192
const icon192 = createIcon(192, '');
fs.writeFileSync('public/pwa-192x192.png', icon192);

// Generate 512x512
const icon512 = createIcon(512, '');
fs.writeFileSync('public/pwa-512x512.png', icon512);

// Generate Apple Touch Icon
const appleIcon = createIcon(180, '');
fs.writeFileSync('public/apple-touch-icon.png', appleIcon);

// Generate Favicon (64x64)
const favicon = createIcon(64, '');
fs.writeFileSync('public/favicon.ico', favicon);

console.log('Icons (Symbol Compass) generated successfully.');
