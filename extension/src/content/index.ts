import { ContentInterceptor } from './interceptor';
import { ContentRestorer } from './restorer';

console.log('🛡️ Ratchet Privacy Shield: Content script loaded');

// Initialize modules
new ContentInterceptor();
new ContentRestorer();
