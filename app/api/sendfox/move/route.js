// THE FINAL AND CORRECT LOGIC: app/api/sendfox/move/route.js
// Uses the List Membership Endpoint to bypass the 405 error on the Contact Update endpoint.

const SENDFOX_API_BASE = 'https://api.sendfox.com';
const API_TOKEN = process.env.SENDFOX_API_TOKEN;

const SOURCE_LIST_ID = 616366; 
const DESTINATION_LIST_ID = 616404; 

export async function POST(request) {
    
    if (!API_TOKEN) {
        return new Response(JSON.stringify({ error: 'Server configuration error: Missing API Token.' }), { 
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    let allContacts = [];
    let nextUrl = `${SENDFOX_API_BASE}/lists/${SOURCE_LIST_ID}/contacts`; 

    // --- 1. FETCH CONTACTS FROM SOURCE LIST (GET) ---
    try {
        while (nextUrl) {
            const response = await fetch(nextUrl, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${API_TOKEN}` },
            });

            if (!response.ok) {
                const errorData = await response.json();
                return new Response(JSON.stringify({ 
                    error: `Failed to fetch contacts from source list (Status: ${response.status})`,
                    detail: errorData 
                }), { status: response.status });
            }

            const data = await response.json();
            allContacts = allContacts.concat(data.data || []); 
            nextUrl = data.links ? (data.links.next || null) : null;
        }
    } catch (error) {
        return new Response(JSON.stringify({ 
            error: 'Failed during contact list fetching.', 
            detail: error.message 
        }), { status: 500 });
    }

    if (allContacts.length === 0) {
        return new Response(JSON.stringify({ 
            success: true, 
            message: 'No contacts found in the source list to migrate.' 
        }), { status: 200 });
    }

    // --- 2. LOOP and ADD EACH CONTACT TO THE DESTINATION LIST (POST to List Endpoint) ---
    const updateResults = [];
    let successCount = 0;

    for (const contact of allContacts) {
        try {
            // CRITICAL FIX: Use the specific List Membership Endpoint
            const listEndpoint = `${SENDFOX_API_BASE}/lists/${DESTINATION_LIST_ID}/contacts`;
            
            // The payload only needs the contact ID to add it to the list
            const listAddPayload = {
                "id": contact.id, 
            };

            const listAddResponse = await fetch(listEndpoint, {
                method: 'POST', 
                headers: {
                    'Authorization': `Bearer ${API_TOKEN}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(listAddPayload),
            });

            if (listAddResponse.ok) {
                successCount++;
            } else {
                let errorDetail = {};
                const contentType = listAddResponse.headers.get('content-type');
                if (contentType && contentType.includes('application/json')) {
                    errorDetail = await listAddResponse.json();
                } else {
                    const rawError = await listAddResponse.text();
                    errorDetail = { 
                        error_type: "List Add Failure",
                        http_status: listAddResponse.status,
                        raw_response_start: rawError.substring(0, 100) + '...' 
                    };
                }

                updateResults.push({ id: contact.id, status: listAddResponse.status, error: errorDetail });
            }
        } catch (error) {
            updateResults.push({ id: contact.id, error: error.message || 'Network failure during list addition.' });
        }
    }

    // --- 3. FINAL SUMMARY RESPONSE ---
    return new Response(JSON.stringify({ 
        success: true, 
        message: `Bulk migration complete. ${successCount} contacts successfully added to list ${DESTINATION_LIST_ID}.`,
        failures: updateResults,
        total_processed: allContacts.length
    }), { status: 200 });
}
