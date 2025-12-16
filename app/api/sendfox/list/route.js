// app/api/sendfox/list/route.js

const SENDFOX_API_BASE = 'https://api.sendfox.com';
const API_TOKEN = process.env.SENDFOX_API_TOKEN;

export async function GET(request) {
    if (!API_TOKEN) {
        return new Response(JSON.stringify({ error: 'Server configuration error: Missing API Token.' }), { 
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const endpoint = `${SENDFOX_API_BASE}/lists`;

    try {
        const response = await fetch(endpoint, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${API_TOKEN}`,
                'Content-Type': 'application/json',
            },
        });

        const data = await response.json();

        // 1. CRITICAL CHECK: Log the data if the response was NOT ok
        if (!response.ok) {
            console.error(`SendFox API returned status ${response.status}. Full response data:`, data);
            return new Response(JSON.stringify({ 
                error: `SendFox API Failed with status ${response.status}`, 
                detail: data 
            }), { 
                status: response.status,
                headers: { 'Content-Type': 'application/json' },
            });
        }
        
        // 2. CRITICAL CHECK: Verify that 'data.data' (the list array) actually exists
        if (!data || !Array.isArray(data.data)) {
            console.error("SendFox response successful (200 OK) but missing 'data.data' property. Raw data:", data);
            return new Response(JSON.stringify({ 
                error: "Unexpected response format from SendFox API.", 
                detail: "Expected an array at data.data, received an invalid structure.",
                raw_data: data
            }), { 
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // 3. Process the list data, now that we know it exists
        const simplifiedLists = data.data.map(list => ({
            id: list.id,
            name: list.name,
        }));
        
        return new Response(JSON.stringify(simplifiedLists), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error('An unexpected error occurred during API call:', error);
        return new Response(JSON.stringify({ 
            error: 'Internal Server Error (Fetch/Network Failure)', 
            detail: error.message 
        }), { 
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
};
