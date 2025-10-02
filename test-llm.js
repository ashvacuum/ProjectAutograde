// Test LLM API Key functionality
require('dotenv').config();

async function testLLM() {
    console.log('\n=== LLM API Key Test ===\n');
    console.log('Note: This test checks .env variables only (electron-store requires the app running).\n');

    // Check environment variables
    console.log('1. Checking .env file...');

    const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
    const hasOpenAI = !!process.env.OPENAI_API_KEY;

    if (hasAnthropic) {
        console.log('   ✅ ANTHROPIC_API_KEY found');
        console.log('   Key preview: ***' + process.env.ANTHROPIC_API_KEY.slice(-4));
    } else {
        console.log('   ❌ ANTHROPIC_API_KEY not set');
    }

    if (hasOpenAI) {
        console.log('   ✅ OPENAI_API_KEY found');
        console.log('   Key preview: ***' + process.env.OPENAI_API_KEY.slice(-4));
    } else {
        console.log('   ❌ OPENAI_API_KEY not set');
    }

    if (!hasAnthropic && !hasOpenAI) {
        console.log('\n   ❌ No LLM API keys found in .env');
        console.log('\n   To fix: Add to your .env file:');
        console.log('   ANTHROPIC_API_KEY=sk-ant-xxxxx');
        console.log('   or');
        console.log('   OPENAI_API_KEY=sk-xxxxx');
        return;
    }

    // Test the API key with a real request
    console.log('\n2. Testing API connection...');

    if (hasAnthropic) {
        console.log('   Testing Anthropic API...');
        try {
            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': process.env.ANTHROPIC_API_KEY,
                    'anthropic-version': '2023-06-01'
                },
                body: JSON.stringify({
                    model: 'claude-3-5-sonnet-20241022',
                    max_tokens: 10,
                    messages: [{ role: 'user', content: 'test' }]
                })
            });

            if (response.ok) {
                console.log('   ✅ Anthropic API key is VALID and working!');
                console.log('   Model: claude-3-5-sonnet-20241022');
            } else {
                const error = await response.text();
                console.log('   ❌ Anthropic API key test failed');
                console.log('   Status:', response.status);
                console.log('   Error:', error.substring(0, 100));
            }
        } catch (error) {
            console.log('   ❌ Connection error:', error.message);
        }
    } else if (hasOpenAI) {
        console.log('   Testing OpenAI API...');
        try {
            const response = await fetch('https://api.openai.com/v1/models', {
                headers: {
                    'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                console.log('   ✅ OpenAI API key is VALID and working!');
                const data = await response.json();
                console.log('   Available models:', data.data?.length || 0);
            } else {
                const error = await response.text();
                console.log('   ❌ OpenAI API key test failed');
                console.log('   Status:', response.status);
                console.log('   Error:', error.substring(0, 100));
            }
        } catch (error) {
            console.log('   ❌ Connection error:', error.message);
        }
    }

    console.log('\n=== Test Complete ===\n');
    console.log('💡 IMPORTANT:');
    console.log('   - Your API key from .env WILL work in the app');
    console.log('   - "Never used" message in UI is normal for .env keys');
    console.log('   - The key gets used during actual grading');
    console.log('   - Start the app with: start-debug.bat\n');
}

testLLM().catch(console.error);
