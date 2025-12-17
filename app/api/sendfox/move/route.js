// NEW CODE for app/api/sendfox/bulk_move/route.js

const SENDFOX_API_BASE = 'https://api.sendfox.com';
const API_TOKEN = process.env.SENDFOX_API_TOKEN;

// --- HARDCODED LIST IDs ---
const SOURCE_LIST_ID = 616366; 
const DESTINATION_LIST_ID = 616404; 
// --------------------------

export async function POST(request) {
    
    if (!API_TOKEN) {
        return new Response(JSON.stringify({ error: 'Server configuration error: Missing API Token.' }), { status: 500 });
    }

    let allContacts = [];
    let nextUrl = `${SENDFOX_API_BASE}/lists/${SOURCE_LIST_ID}/contacts`; // Start with the first page

    // --- 1. FETCH ALL CONTACTS FROM SOURCE LIST (Handles Pagination) ---
    try {
        while (nextUrl) {
            console.log(`Fetching contacts from URL: ${nextUrl}`);
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
            
            // Check for next page URL (SendFox uses 'next' in its links property)
            nextUrl = data.links ? (data.links.next || null) : null;
            
            // **Vercel Timeout Guardrail:** If you hit your limit here, the process stops.
            if (allContacts.length > 500 && nextUrl) { 
                 console.warn("Stopping fetch after 500 contacts to avoid Vercel timeout.");
                 nextUrl = null; 
            }
        }
    } catch (error) {
        console.error('Bulk Fetch Error:', error);
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

    // --- 2. LOOP AND UPDATE EACH CONTACT (PUT Request) ---
    const updateResults = [];
    let successCount = 0;

    for (const contact of allContacts) {
        try {
            const updateEndpoint = `${SENDFOX_API_BASE}/contacts/${contact.id}`;
            
            // The PUT payload requires the NEW list ID(s)
            const updatePayload = {
                "lists": [DESTINATION_LIST_ID], 
                "status": "subscribed" 
            };

            const updateResponse = await fetch(updateEndpoint, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${API_TOKEN}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(updatePayload),
            });

            if (updateResponse.ok) {
                successCount++;
            } else {
                const errorDetail = await updateResponse.json();
                updateResults.push({ id: contact.id, status: updateResponse.status, error: errorDetail });
            }
        } catch (error) {
            updateResults.push({ id: contact.id, error: 'Network failure during update.' });
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
