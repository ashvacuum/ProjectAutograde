// Test the EXACT API call used during grading
require('dotenv').config();

async function testRealAnthropicCall() {
    console.log('\n=== Testing ACTUAL Anthropic Grading API Call ===\n');

    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
        console.log('❌ No ANTHROPIC_API_KEY found in .env');
        return;
    }

    console.log('API Key Preview:', '***' + apiKey.slice(-4));
    console.log('API Key Length:', apiKey.length);
    console.log('API Key Type:', apiKey.startsWith('sk-ant-api03') ? 'API Key (correct)' : 'Other type');

    // Test 1: The test endpoint (what works)
    console.log('\n--- Test 1: Testing /v1/models endpoint (what the Test button uses) ---');
    try {
        const testResponse = await fetch('https://api.anthropic.com/v1/models', {
            headers: {
                'x-api-key': apiKey,
                'Content-Type': 'application/json',
                'anthropic-version': '2023-06-01'
            }
        });

        console.log('Status:', testResponse.status);
        if (testResponse.ok) {
            console.log('✅ Test endpoint works!');
        } else {
            const errorText = await testResponse.text();
            console.log('❌ Test endpoint failed:', errorText);
        }
    } catch (error) {
        console.log('❌ Error:', error.message);
    }

    // Test 2: The messages endpoint with old version (what grading uses)
    console.log('\n--- Test 2: Testing /v1/messages endpoint with version 2023-06-01 ---');
    try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-3-5-sonnet-20241022',
                max_tokens: 10,
                messages: [{ role: 'user', content: 'test' }]
            })
        });

        console.log('Status:', response.status);
        if (response.ok) {
            const data = await response.json();
            console.log('✅ Messages endpoint works with 2023-06-01!');
            console.log('Response:', data.content[0].text);
        } else {
            const errorText = await response.text();
            console.log('❌ Messages endpoint failed with 2023-06-01');
            console.log('Error:', errorText);
        }
    } catch (error) {
        console.log('❌ Error:', error.message);
    }

    // Test 3: Try with newer version
    console.log('\n--- Test 3: Testing /v1/messages endpoint with version 2023-01-01 ---');
    try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-01-01'
            },
            body: JSON.stringify({
                model: 'claude-3-5-sonnet-20241022',
                max_tokens: 10,
                messages: [{ role: 'user', content: 'test' }]
            })
        });

        console.log('Status:', response.status);
        if (response.ok) {
            const data = await response.json();
            console.log('✅ Messages endpoint works with 2023-01-01!');
            console.log('Response:', data.content[0].text);
        } else {
            const errorText = await response.text();
            console.log('❌ Messages endpoint failed with 2023-01-01');
            console.log('Error:', errorText);
        }
    } catch (error) {
        console.log('❌ Error:', error.message);
    }

    // Test 4: Try without anthropic-version header
    console.log('\n--- Test 4: Testing without anthropic-version header ---');
    try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey
            },
            body: JSON.stringify({
                model: 'claude-3-5-sonnet-20241022',
                max_tokens: 10,
                messages: [{ role: 'user', content: 'test' }]
            })
        });

        console.log('Status:', response.status);
        if (response.ok) {
            const data = await response.json();
            console.log('✅ Messages endpoint works without version!');
            console.log('Response:', data.content[0].text);
        } else {
            const errorText = await response.text();
            console.log('❌ Messages endpoint failed without version');
            console.log('Error:', errorText);
        }
    } catch (error) {
        console.log('❌ Error:', error.message);
    }

    console.log('\n=== Test Complete ===\n');
}

testRealAnthropicCall().catch(console.error);
