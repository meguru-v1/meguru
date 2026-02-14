
import fs from 'fs';
import { createCanvas } from 'canvas';

function createIcon(size, text) {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');

    // Gradient Background (Amber to Deep Orange)
    const gradient = ctx.createLinearGradient(0, 0, size, size);
    gradient.addColorStop(0, '#fbfbfb'); // White-ish top
    gradient.addColorStop(1, '#f3f4f6'); // Light gray bottom

    // Wait, user wants "Meguru" style. Let's stick to the brand color: Amber/Orange
    // But maybe a bit more modern.
    // Let's do a deep gradient.
    const brandGradient = ctx.createLinearGradient(0, 0, 0, size);
    brandGradient.addColorStop(0, '#fbbf24'); // Amber-400
    brandGradient.addColorStop(1, '#d97706'); // Amber-600

    ctx.fillStyle = brandGradient;
    ctx.fillRect(0, 0, size, size);

    // Add a subtle inner white border/ring
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = size * 0.04;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size * 0.42, 0, Math.PI * 2);
    ctx.stroke();

    // Add a "compass needle" abstraction
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.rotate(-Math.PI / 4); // 45 deg tilt

    // Draw simplified needle
    // ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    // ctx.beginPath();
    // ctx.moveTo(0, -size * 0.3);
    // ctx.lineTo(size * 0.1, 0);
    // ctx.lineTo(0, size * 0.3);
    // ctx.lineTo(-size * 0.1, 0);
    // ctx.fill();

    ctx.restore();

    // Text "M"
    ctx.fillStyle = 'white';
    const fontSize = size * 0.55;
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Drop Shadow
    ctx.shadowColor = 'rgba(0,0,0,0.15)';
    ctx.shadowBlur = size * 0.05;
    ctx.shadowOffsetY = size * 0.02;

    // Adjust Y slightly to optically center "M"
    ctx.fillText(text, size / 2, size / 2 + (size * 0.04));

    return canvas.toBuffer('image/png');
}

// Generate 192x192
const icon192 = createIcon(192, 'M');
fs.writeFileSync('public/pwa-192x192.png', icon192);

// Generate 512x512
const icon512 = createIcon(512, 'M');
fs.writeFileSync('public/pwa-512x512.png', icon512);

// Generate Apple Touch Icon
const appleIcon = createIcon(180, 'M');
fs.writeFileSync('public/apple-touch-icon.png', appleIcon);

// Generate Favicon (64x64)
const favicon = createIcon(64, 'M');
fs.writeFileSync('public/favicon.ico', favicon);

console.log('Icons (Stylish Gradients) generated successfully.');
