// FINAL WORKING CODE: app/api/sendfox/move/route.js
// This code successfully migrates contacts by using SendFox's required POST-to-Creation-Endpoint pattern.

const SENDFOX_API_BASE = 'https://api.sendfox.com';
const API_TOKEN = process.env.SENDFOX_API_TOKEN;

// --- HARDCODED LIST IDs ---
const SOURCE_LIST_ID = 616366; 
const DESTINATION_LIST_ID = 616404; 
// --------------------------

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

    // --- 2. LOOP and ADD EACH CONTACT TO THE DESTINATION LIST (POST to /contacts) ---
    const updateResults = [];
    let successCount = 0;

    for (const contact of allContacts) {
        try {
            // *** CRITICAL FINAL FIX: Use the generic /contacts endpoint for update ***
            const updateEndpoint = `${SENDFOX_API_BASE}/contacts`; 
            
            // 1. Get current list IDs safely (needed for the update payload)
            // This prevents the "Cannot read properties of undefined" error
            const currentListIds = (contact.lists ?? []).map(list => list.id);
            
            // 2. Add the destination list ID to the set
            const newListsSet = new Set(currentListIds);
            newListsSet.add(DESTINATION_LIST_ID); 

            // 3. Prepare the final payload
            const updatePayload = {
                "id": contact.id,          // This ID forces the API to update the existing contact
                "email": contact.email,    // Required for update
                "first_name": contact.first_name || '', // Use existing data or empty string
                "last_name": contact.last_name || '',   // Use existing data or empty string
                "lists": Array.from(newListsSet), // Send the full list of memberships (old + new)
                "status": "subscribed" 
            };

            const updateResponse = await fetch(updateEndpoint, {
                method: 'POST', // POST is the only method that works on this endpoint
                headers: {
                    'Authorization': `Bearer ${API_TOKEN}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(updatePayload),
            });

            if (updateResponse.ok) {
                successCount++;
            } else {
                let errorDetail = {};
                // Robust Error Handling
                const contentType = updateResponse.headers.get('content-type');
                if (contentType && contentType.includes('application/json')) {
                    errorDetail = await updateResponse.json();
                } else {
                    const rawError = await updateResponse.text();
                    errorDetail = { 
                        error_type: "List Add Failure",
                        http_status: updateResponse.status,
                        raw_response_start: rawError.substring(0, 100) + '...' 
                    };
                }

                updateResults.push({ id: contact.id, status: updateResponse.status, error: errorDetail });
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
