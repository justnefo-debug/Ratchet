import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import url from 'url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, '..', 'dist');

if (!fs.existsSync(distDir)) {
    console.error('dist/ does not exist. Run build first.');
    process.exit(1);
}

const checkFiles = (dir) => {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            checkFiles(fullPath);
        } else {
            // Check for test files
            if (file.includes('.test.') || file.includes('.spec.')) {
                console.error(`Found test file in dist: ${fullPath}`);
                process.exit(1);
            }
            // Check for source maps
            if (file.endsWith('.map')) {
                console.error(`Found source map in dist: ${fullPath}`);
                process.exit(1);
            }
            // Read content
            const content = fs.readFileSync(fullPath, 'utf8');
            // Check for localhost
            if (content.includes('localhost') || content.includes('127.0.0.1')) {
                console.error(`Found localhost/127.0.0.1 in dist file: ${fullPath}`);
                process.exit(1);
            }
            // Check for mock adapter mentions (heuristic)
            if (file.includes('mock') || (content.includes('class MockAdapter') && !file.includes('interceptor'))) {
                 // The built file might contain mock if it wasn't excluded. Let's just check for 'MockAdapter' usage if it's not a generic word
                if (content.includes('MockAdapter')) {
                    console.error(`Found MockAdapter in dist file: ${fullPath}`);
                    process.exit(1);
                }
            }
        }
    }
}

console.log('Validating dist/ directory for production packaging...');
checkFiles(distDir);
console.log('Validation passed. No localhost, mock adapters, test files, or source maps found.');

const outZip = path.join(__dirname, '..', 'ratchet-v1.0.0.zip');
if (fs.existsSync(outZip)) {
    fs.unlinkSync(outZip);
}

console.log('Zipping dist/ folder...');
try {
    execSync(`powershell -Command "Compress-Archive -Path '${distDir}\\*' -DestinationPath '${outZip}' -Force"`);
    console.log(`Successfully created ${outZip}`);
} catch (e) {
    console.error('Failed to create zip archive.', e.message);
    process.exit(1);
}
