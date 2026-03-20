import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const apiKey = process.env.VITE_MANYCHAT_API_KEY || process.env.MANYCHAT_API_KEY;

if (!apiKey) {
    console.error("No Manychat API Key found!");
    process.exit(1);
}

const headers = {
    'accept': 'application/json',
    'Authorization': `Bearer ${apiKey.replace(/^Bearer\s+/i, '').trim()}`
};

async function checkManychat() {
    try {
        console.log("Fetching custom fields...");
        const fieldsRes = await fetch('https://api.manychat.com/fb/custom_field/getList', { headers });
        const text = await fieldsRes.text();
        let fieldsData;
        try {
            fieldsData = JSON.parse(text);
        } catch (e) {
            console.log("Error parsing JSON. Raw Response:", text);
            return;
        }
        
        if (!fieldsData.data) {
             console.log("Error fetching fields, no data:", fieldsData);
             return;
        }

        const chatgptFields = fieldsData.data.filter((f: any) => f.name.includes('CHATGPT'));
        console.log("Found ChatGPT Fields:", chatgptFields.map((f: any) => ({id: f.id, name: f.name})));
        
        const statusField = chatgptFields.find((f: any) => f.name === 'CHATGPT STATUS');
        
        if (statusField) {
             console.log(`\nSearching for subscribers with CHATGPT STATUS = requires_action...`);
             const searchRes = await fetch(`https://api.manychat.com/fb/subscriber/findByCustomField?custom_field_id=${statusField.id}&custom_field_value=requires_action`, { headers });
             const searchData = await searchRes.json();
             
             if (searchData.data && searchData.data.length > 0) {
                 for (const sub of searchData.data) {
                      console.log(`\nSubscriber: ${sub.first_name} ${sub.last_name} (${sub.id})`);
                      // Fetch full info to get all custom fields
                      const infoRes = await fetch(`https://api.manychat.com/fb/subscriber/getInfo?subscriber_id=${sub.id}`, { headers });
                      const infoData = await infoRes.json();
                      
                      const relevantFields = infoData.data.custom_fields.filter((cf: any) => chatgptFields.some((f: any) => f.id === cf.id));
                      console.log(JSON.stringify(relevantFields, null, 2));
                 }
             } else {
                 console.log("No subscribers found stuck in requires_action.");
             }
        }
    } catch (e) {
        console.error(e);
    }
}

checkManychat();
