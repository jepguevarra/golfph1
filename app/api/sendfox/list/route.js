// golfph1/app/api/sendfox/list/route.js

const SENDFOX_API_BASE = 'https://api.sendfox.com';
const API_TOKEN = process.env.SENDFOX_API_TOKEN;

// This function handles the GET request to the /api/sendfox/list URL.
export async function GET(request) {
    // ... (All the validation and fetch code from before)

    const endpoint = `${SENDFOX_API_BASE}/lists`;

    try {
        const response = await fetch(endpoint, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${API_TOKEN}`,
                'Content-Type': 'application/json',
            },
        });

        // ... (Error handling)

        const data = await response.json();
        const simplifiedLists = data.data.map(list => ({
            id: list.id,
            name: list.name,
        }));
        
        return new Response(JSON.stringify(simplifiedLists), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error) {
        // ... (Catch block)
        return new Response(JSON.stringify({ 
            error: 'Internal Server Error', 
            detail: error.message 
        }), { 
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
};
