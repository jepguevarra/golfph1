const SENDFOX_API_BASE = 'https://api.sendfox.com';
const API_TOKEN = process.env.SENDFOX_API_TOKEN;

const SOURCE_LIST_ID = 616366; 
const DESTINATION_LIST_ID = 616404; 

export async function POST(request) {
    if (!API_TOKEN) return new Response(JSON.stringify({ error: 'Missing API Token' }), { status: 500 });

    let allContacts = [];
    let nextUrl = `${SENDFOX_API_BASE}/lists/${SOURCE_LIST_ID}/contacts`; 

    // 1. Fetch all source contacts (Fast)
    try {
        while (nextUrl) {
            const response = await fetch(nextUrl, { headers: { 'Authorization': `Bearer ${API_TOKEN}` } });
            const data = await response.json();
            allContacts = allContacts.concat(data.data || []); 
            nextUrl = data.links?.next || null;
        }
    } catch (e) { return new Response(JSON.stringify({ error: 'Fetch failed' }), { status: 500 }); }

    if (allContacts.length === 0) return new Response(JSON.stringify({ message: "No contacts found" }), { status: 200 });

    // 2. Parallel Processing
    let successCount = 0;
    const failures = [];

    // We use a batch size of 15 to stay fast but avoid hitting SendFox rate limits
    const batchSize = 15; 
    
    for (let i = 0; i < allContacts.length; i += batchSize) {
        const batch = allContacts.slice(i, i + batchSize);
        
        const results = await Promise.all(batch.map(async (contact) => {
            try {
                const currentListIds = (contact.lists ?? []).map(l => l.id);
                const newListsSet = new Set(currentListIds);
                newListsSet.add(DESTINATION_LIST_ID); 

                const response = await fetch(`${SENDFOX_API_BASE}/contacts`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${API_TOKEN}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        "id": contact.id,
                        "email": contact.email,
                        "lists": Array.from(newListsSet),
                        "status": "subscribed"
                    }),
                });

                return response.ok;
            } catch (err) {
                return false;
            }
        }));

        successCount += results.filter(r => r === true).length;
        
        // If we've processed a lot, give the system a tiny breather to stay under rate limits
        if (i > 0) await new Promise(res => setTimeout(res, 100));
    }

    return new Response(JSON.stringify({ 
        success: true, 
        message: `Successfully processed ${successCount} contacts in this run.`,
        total_found_in_source: allContacts.length
    }), { status: 200 });
}
