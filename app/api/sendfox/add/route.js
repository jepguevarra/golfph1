// FULL, FINAL CODE for app/api/sendfox/add/route.js

const SENDFOX_API_BASE = 'https://api.sendfox.com';
const API_TOKEN = process.env.SENDFOX_API_TOKEN;

export async function POST(request) {
    let payload;

    // --- 1. INITIAL CHECKS & PAYLOAD READING ---
    try {
        if (!API_TOKEN) {
             return new Response(JSON.stringify({ error: 'Server configuration error: Missing API Token.' }), { 
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            });
        }
        
        payload = await request.json(); 
    } catch (e) {
        return new Response(JSON.stringify({ 
            error: "Invalid Request Body", 
            detail: "Failed to parse JSON. Ensure Content-Type is application/json." 
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
    
    // CRITICAL FIX: Target the list-specific endpoint to enforce subscription status
    const listIdInt = parseInt(list_id);
    // Use the list-specific endpoint: /lists/{list_id}/contacts
    const endpoint = `${SENDFOX_API_BASE}/lists/${listIdInt}/contacts`;

    // Prepare the final payload for the list endpoint
    // NOTE: We DO NOT pass list_id in the body here, as it's in the URL path.
    const sendfoxPayload = {
        email: email, 
        first_name: first_name, 
        last_name: last_name, 
        
        // CRITICAL FIX: Explicitly set the status to 'subscribed'
        // This parameter is most effective on the list-specific endpoint.
        "status": "subscribed", 
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

        // The list endpoint often returns a 204 No Content on success, 
        // but we'll try to read the JSON just in case it returns data.
        let data = {};
        try {
            data = await response.json();
        } catch (e) {
            // Ignore if response has no body (e.g., 204 No Content)
        }

        // --- 3. RESPONSE HANDLING ---

        if (response.ok) { 
            // Return success. If the status is not confirmed, it's a SendFox setting issue.
            return new Response(JSON.stringify({ 
                success: true, 
                message: 'Contact added and requested to be confirmed to the list.',
                sendfox_data: data 
            }), { 
                status: 200, 
                headers: { 'Content-Type': 'application/json' },
            });
        } 
        
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
