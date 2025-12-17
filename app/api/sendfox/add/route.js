// FINAL, ADJUSTED CODE for app/api/sendfox/add/route.js

const SENDFOX_API_BASE = 'https://api.sendfox.com';
const API_TOKEN = process.env.SENDFOX_API_TOKEN;

// HARDCODED LIST ID: Since Odoo doesn't send it, we define it here.
const SENDFOX_LIST_ID = 616366; 

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
        
        // CRITICAL: Read the request body as JSON.
        payload = await request.json(); 
    } catch (e) {
        // Handle failure if the body is unreadable
        return new Response(JSON.stringify({ 
            error: "Invalid Request Body", 
            detail: "Failed to parse JSON. Ensure Content-Type is application/json." 
        }), { 
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // Deconstruct fields expected from Odoo: email and name (full name)
    // We expect the incoming payload to look like: { "email": "...", "name": "Full Name", ... }
    const { email, name } = payload; 
    
    // Check only the fields we are receiving that are required
    if (!email || !name) {
        return new Response(JSON.stringify({ 
            error: "Missing required fields from Odoo", 
            detail: "The request must contain 'email' and 'name'." 
        }), { 
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }
    
    // --- 2. SEND FOX API CALL PREPARATION ---
    
    const endpoint = `${SENDFOX_API_BASE}/contacts`; 

    // Prepare the final payload, adjusting Odoo fields for SendFox
    const sendfoxPayload = {
        email: email, 
        
        // FIX 1: Use Odoo's full 'name' field for SendFox's 'first_name'
        first_name: name, 
        
        // FIX 2: Set last_name to null/empty string as it's not provided
        last_name: "", 
        
        // FIX 3: Use the hardcoded list ID
        "lists": [SENDFOX_LIST_ID], 
        
        // Essential: Set contact as confirmed
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
