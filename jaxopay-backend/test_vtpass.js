import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const publicKey = process.env.VTPASS_PUBLIC_KEY;
const secretKey = process.env.VTPASS_SECRET_KEY;
const apiKey = process.env.VTPASS_API_KEY;

const isProd = process.env.NODE_ENV === 'production';
const baseURL = isProd ? 'https://api-service.vtpass.com/api' : 'https://sandbox.vtpass.com/api';

console.log('Testing VTpass with:', { baseURL, publicKey: publicKey?.substring(0, 10) + '...', hasSecret: !!secretKey, hasApiKey: !!apiKey });

async function test() {
    try {
        const headers = { 'Content-Type': 'application/json' };
        if (apiKey) headers['api-key'] = apiKey;
        if (publicKey) headers['public-key'] = publicKey;

        // For GET requests, VTpass uses public-key, for POST it uses secret-key. (Based on VTpassAdapter logic)

        const res = await axios.get(`${baseURL}/services?identifier=electricity-bill`, {
            headers
        });
        console.log('Response Status:', res.status);
        console.log('Response Data JSON:', JSON.stringify(res.data, null, 2));
    } catch (err) {
        console.error('Error:', err.response ? err.response.data : err.message);
    }
}

test();
