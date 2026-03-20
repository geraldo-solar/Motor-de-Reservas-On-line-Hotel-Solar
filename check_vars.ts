import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const apiKey = process.env.VITE_MANYCHAT_API_KEY || process.env.MANYCHAT_API_KEY;

if (!apiKey) {
    console.error("No Manychat API Key found");
    process.exit(1);
}

const headers = {
    'accept': 'application/json',
    'Authorization': `Bearer ${apiKey.replace(/^Bearer\s+/i, '').trim()}`
};

async function getSubscriberVars() {
    try {
        const subId = '1536776675';
        const res = await fetch(`https://api.manychat.com/fb/subscriber/getInfo?subscriber_id=${subId}`, { headers });
        const data = await res.json();
        
        if (!res.ok) {
            console.error("Error fetching subscriber:", data);
            return;
        }

        const cfs = data.data.custom_fields;
        console.log("\n=== CHATGPT VARIABLES FOR GERALDO ===");
        
        const chatgptFields = cfs.filter((f: any) => f.name.toUpperCase().includes('CHATGPT'));
        
        for (const f of chatgptFields) {
            console.log(`- ${f.name}: \n  -> ${f.value}`);
        }
        
    } catch(e) {
        console.error("Exception:", e);
    }
}

getSubscriberVars();
