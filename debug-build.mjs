import { build } from 'vite';

async function run() {
    try {
        await build();
        console.log("Build complete");
    } catch (e) {
        console.error("VITE BUILD ERROR CAUGHT:", e);
        process.exit(1);
    }
}
run();
