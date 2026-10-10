import { exec } from 'child_process';
import path from 'path';
import url from 'url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

console.log('\n======================================================');
console.log('🐀 Ratchet Privacy Shield - Interactive Demo');
console.log('======================================================\n');
console.log('1. Ensure you have built the test version by running: npm run build:test');
console.log('2. Open Chrome and navigate to chrome://extensions/');
console.log('3. Enable "Developer mode" in the top right corner.');
console.log('4. Click "Load unpacked" and select the following folder:');
console.log('   ' + path.resolve(__dirname, '..', 'dist-test'));
console.log('5. The Mock Chat server is starting below.');
console.log('6. Navigate to the local URL (usually http://localhost:5173)');
console.log('7. Try sending a message with sensitive data like a name, email, or credit card.\n');

console.log('Starting mock chat server...');
const child = exec('npm run dev', { cwd: path.resolve(__dirname, '..', '..', 'frontend') });
child.stdout.pipe(process.stdout);
child.stderr.pipe(process.stderr);
