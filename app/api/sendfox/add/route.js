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
    
    // Use the simple /contacts endpoint
    const endpoint = `${SENDFOX_API_BASE}/contacts`; 

    // Prepare the final payload, including the CORRECT array structure for lists.
    const sendfoxPayload = {
        email: email, 
        first_name: first_name, 
        last_name: last_name, 
        
        // CRITICAL FIX: The list IDs must be sent in an array named 'lists'
        "lists": [parseInt(list_id)], 
        
        // CRITICAL FIX: Explicitly set the status to 'subscribed'
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

        let data = {};
        try {
            data = await response.json();
        } catch (e) {
            // Ignore if response has no body
        }

        // --- 3. RESPONSE HANDLING ---

        if (response.ok) { 
            return new Response(JSON.stringify({ 
                success: true, 
                message: 'Contact created and assigned to list successfully!',
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
