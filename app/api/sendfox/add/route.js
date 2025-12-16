// COMPLETE AND CORRECTED CODE for golfph1/app/api/sendfox/add/route.js

const SENDFOX_API_BASE = 'https://api.sendfox.com';
const API_TOKEN = process.env.SENDFOX_API_TOKEN;

export async function POST(request) {
    
    // --- START: Missing Payload Reading & Validation ---
    let payload;
    try {
        // Check for missing API Token configuration (Server-side check)
        if (!API_TOKEN) {
             return new Response(JSON.stringify({ error: 'Server configuration error: Missing API Token.' }), { 
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            });
        }
        
        // CRITICAL STEP: Read the request body as JSON
        payload = await request.json(); 
    } catch (e) {
        // Return 400 if the body is missing or unreadable (the cause of your "payload is not defined" error)
        return new Response(JSON.stringify({ 
            error: "Invalid Request Body", 
            detail: "Failed to parse JSON. Ensure Content-Type is application/json and body is not empty." 
        }), { status: 400 });
    }

    // Deconstruct and validate required fields
    const { email, first_name, last_name, list_id } = payload; 

    if (!email || !list_id) {
        return new Response(JSON.stringify({ 
            error: "Missing required fields", 
            detail: "The request must contain 'email' and 'list_id'." 
        }), { status: 400 });
    }
    
    // You can also perform additional data cleaning/preparation here if needed
    
    // --- END: Missing Payload Reading & Validation ---
    
    const endpoint = `${SENDFOX_API_BASE}/contacts`;

    try {
        // The fetch call now correctly uses the defined 'payload' variable
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
        if (response.ok) { 
            return new Response(JSON.stringify({ 
                success: true, 
                message: 'Contact successfully added or updated in SendFox.',
                contact_id: data.id,
                sendfox_data: data 
            }), { 
                status: 200, 
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
                status: response.status, 
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
