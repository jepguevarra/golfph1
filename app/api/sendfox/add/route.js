// REVISED CODE for golfph1/app/api/sendfox/add/route.js

const SENDFOX_API_BASE = 'https://api.sendfox.com';
const API_TOKEN = process.env.SENDFOX_API_TOKEN;

export async function POST(request) {
    // ... (Token and body validation logic) ...
    
    const endpoint = `${SENDFOX_API_BASE}/contacts`;

    try {
        // ... (payload preparation) ...

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${API_TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        const data = await response.json();

        // 1. Check for ANY successful status code (200-299)
        if (response.ok) { // response.ok checks for status codes in the 200-299 range
            return new Response(JSON.stringify({ 
                success: true, 
                message: 'Contact successfully added or updated in SendFox.',
                contact_id: data.id,
                sendfox_data: data // Optionally include full data for verification
            }), { 
                status: 200, // Return a clean 200 OK status to Odoo
                headers: { 'Content-Type': 'application/json' },
            });
        } 
        
        // 2. Handle failure status codes (4xx or 5xx)
        else {
            console.error(`SendFox API error (${response.status}):`, data);
            return new Response(JSON.stringify({ 
                error: `Failed to add contact to SendFox (Status: ${response.status})`, 
                detail: data 
            }), { 
                status: response.status, // Return the actual SendFox error status
                headers: { 'Content-Type': 'application/json' },
            });
        }

    } catch (error) {
        // ... (Network/Internal Server Error handling) ...
        return new Response(JSON.stringify({ 
            error: 'Internal Server Error (Fetch/Network Failure)', 
            detail: error.message 
        }), { 
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
};
