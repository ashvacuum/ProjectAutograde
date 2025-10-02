// Quick test to verify .env is loading correctly
require('dotenv').config();

console.log('\n=== Environment Variable Test ===\n');

console.log('Canvas Configuration:');
console.log('  CANVAS_API_URL:', process.env.CANVAS_API_URL ? '✅ Set' : '❌ Not set');
console.log('  CANVAS_TOKEN:', process.env.CANVAS_TOKEN ? '✅ Set' : '❌ Not set');
console.log('  CANVAS_API_KEY:', process.env.CANVAS_API_KEY ? '✅ Set' : '❌ Not set');

console.log('\nLLM Configuration:');
console.log('  ANTHROPIC_API_KEY:', process.env.ANTHROPIC_API_KEY ? '✅ Set' : '❌ Not set');
console.log('  OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? '✅ Set' : '❌ Not set');

console.log('\nGitHub Configuration:');
console.log('  GITHUB_TOKEN:', process.env.GITHUB_TOKEN ? '✅ Set' : '❌ Not set');

console.log('\n=== Test Complete ===\n');

if (process.env.CANVAS_API_KEY || process.env.CANVAS_TOKEN) {
    console.log('✅ Canvas credentials detected in .env file');
    console.log('   The app will use these if no credentials are stored in electron-store.\n');
} else {
    console.log('⚠️  No Canvas credentials found in .env file');
    console.log('   Make sure you have CANVAS_API_KEY or CANVAS_TOKEN set in .env\n');
}
