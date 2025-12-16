// golfph1/app/api/sendfox/add/route.js

const SENDFOX_API_BASE = 'https://api.sendfox.com';
const API_TOKEN = process.env.SENDFOX_API_TOKEN;

// This function handles the POST request to the /api/sendfox/add URL.
export async function POST(request) {
    if (!API_TOKEN) {
        return new Response(JSON.stringify({ error: 'Server configuration error.' }), { 
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // 1. Parse the request body from Odoo/Server Action
    let body;
    try {
        body = await request.json();
    } catch (e) {
        return new Response(JSON.stringify({ error: 'Invalid JSON body.' }), { status: 400 });
    }

    const { email, first_name, last_name, list_id } = body;

    // 2. Validate essential fields
    if (!email || !list_id) {
        return new Response(JSON.stringify({ error: 'Missing required fields (email and list_id).' }), { status: 400 });
    }

    const endpoint = `${SENDFOX_API_BASE}/contacts`;

    try {
        // 3. Prepare the data for SendFox (matching their POST /contacts structure)
        const payload = {
            email: email,
            first_name: first_name || '', // Use empty string if not provided
            last_name: last_name || '',
            lists: [list_id], // The lists field expects an array of IDs
            // Add other fields (e.g., tags) if needed
        };

        // 4. Make the POST request to SendFox
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${API_TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        // 5. Handle SendFox API response
        if (response.status === 201) { // 201 Created is typical for a successful POST
            const data = await response.json();
            return new Response(JSON.stringify({ 
                success: true, 
                message: 'Contact added successfully to SendFox list.',
                contact_id: data.id 
            }), { 
                status: 201,
                headers: { 'Content-Type': 'application/json' },
            });
        } else {
            const errorText = await response.text();
            console.error(`SendFox API error (${response.status}): ${errorText}`);
            return new Response(JSON.stringify({ 
                error: 'Failed to add contact to SendFox', 
                detail: errorText 
            }), { 
                status: response.status,
                headers: { 'Content-Type': 'application/json' },
            });
        }

    } catch (error) {
        console.error('An unexpected error occurred:', error);
        return new Response(JSON.stringify({ 
            error: 'Internal Server Error', 
            detail: error.message 
        }), { 
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
};
