import axios from 'axios';

async function test() {
    try {
        const res = await axios.get('http://localhost:3001/api/v1/bills/providers?category=electricity');
        console.log('Status:', res.status);
        console.log('Data:', JSON.stringify(res.data, null, 2));
    } catch (err) {
        console.error('Error Status:', err.response?.status);
        console.error('Error Data:', JSON.stringify(err.response?.data, null, 2));
        console.error('Message:', err.message);
    }
}

test();
