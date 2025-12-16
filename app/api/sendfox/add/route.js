// FULL, REVISED CODE for app/api/sendfox/add/route.js

const SENDFOX_API_BASE = 'https://api.sendfox.com';
const API_TOKEN = process.env.SENDFOX_API_TOKEN;

export async function POST(request) {
    let payload;

    // --- 1. INITIAL CHECKS & PAYLOAD READING ---
    try {
        // Check for missing API Token configuration (Server-side check)
        if (!API_TOKEN) {
             return new Response(JSON.stringify({ error: 'Server configuration error: Missing API Token.' }), { 
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            });
        }
        
        // CRITICAL: Read the request body as JSON. This MUST be the first line
        // to handle the body inside the try block.
        payload = await request.json(); 
    } catch (e) {
        // Return 400 if the body is missing or unreadable (e.g., missing Content-Type)
        return new Response(JSON.stringify({ 
            error: "Invalid Request Body", 
            detail: "Failed to parse JSON. Ensure Content-Type is application/json and body is correctly formatted." 
        }), { 
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // Deconstruct and validate required fields
    const { email, first_name, last_name, list_id } = payload; 

    if (!email || !list_id) {
        return new Response(JSON.stringify({ 
            error: "Missing required fields", 
            detail: "The request must contain 'email' and 'list_id'." 
        }), { 
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }
    
    // --- 2. SEND FOX API CALL PREPARATION ---
    
    const endpoint = `${SENDFOX_API_BASE}/contacts`;

    // Prepare the final payload including the skip_confirmation flag
    const sendfoxPayload = {
        email: email, 
        first_name: first_name, 
        last_name: last_name, 
        list_id: parseInt(list_id), // Ensure list_id is an integer for SendFox
        "skip_confirmation": true, // Skips the double opt-in email
    };


    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${API_TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(sendfoxPayload),
        });

        // Read the response data (this is the SendFox response body)
        const data = await response.json();

        // --- 3. RESPONSE HANDLING ---

        // Check for ANY successful status code (response.ok = 200-299)
        if (response.ok) { 
            return new Response(JSON.stringify({ 
                success: true, 
                message: 'Contact successfully added and confirmed in SendFox.',
                contact_id: data.id,
                sendfox_data: data // Optional: returns the full SendFox contact object
            }), { 
                status: 200, // Return 200 OK for Odoo/Client success
                headers: { 'Content-Type': 'application/json' },
            });
        } 
        
        // Handle failure status codes (4xx or 5xx)
        else {
            // Log the detailed error from SendFox
            console.error(`SendFox API error (${response.status}):`, data);
            return new Response(JSON.stringify({ 
                error: `Failed to add contact to SendFox (Status: ${response.status})`, 
                detail: data // Return the detailed SendFox error body
            }), { 
                status: response.status, // Return the actual SendFox error status
                headers: { 'Content-Type': 'application/json' },
            });
        }

    } catch (error) {
        // Catch network errors, DNS failure, etc.
        console.error('Network or unexpected internal error:', error);
        return new Response(JSON.stringify({ 
            error: 'Internal Server Error (Fetch/Network Failure)', 
            detail: error.message 
        }), { 
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}
