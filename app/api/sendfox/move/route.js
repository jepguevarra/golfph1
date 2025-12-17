// FINAL WORKING CODE for app/api/sendfox/move/route.js
// Bulk migrates ALL contacts from SOURCE_LIST_ID to DESTINATION_LIST_ID (copy/add)

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

    // --- 1. FETCH CONTACTS FROM SOURCE LIST (Handles Pagination) ---
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
                }), { 
                    status: response.status,
                    headers: { 'Content-Type': 'application/json' },
                });
            }

            const data = await response.json();
            allContacts = allContacts.concat(data.data || []); 
            
            nextUrl = data.links ? (data.links.next || null) : null;
        }
    } catch (error) {
        console.error('Bulk Fetch Error:', error);
        return new Response(JSON.stringify({ 
            error: 'Failed during contact list fetching.', 
            detail: error.message 
        }), { 
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    if (allContacts.length === 0) {
        return new Response(JSON.stringify({ 
            success: true, 
            message: 'No contacts found in the source list to migrate.' 
        }), { 
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // --- 2. LOOP and SMART UPDATE EACH CONTACT (Using POST method) ---
    const updateResults = [];
    let successCount = 0;

    for (const contact of allContacts) {
        try {
            // CRITICAL FIX: Safely access contact.lists. If it's undefined, use an empty array.
            const currentListIds = (contact.lists ?? []).map(list => list.id);
            
            // Use Set to ensure unique IDs and include the new destination list
            const newListsSet = new Set(currentListIds);
            newListsSet.add(DESTINATION_LIST_ID); 

            const updateEndpoint = `${SENDFOX_API_BASE}/contacts/${contact.id}`;
            
            const updatePayload = {
                "lists": Array.from(newListsSet), 
                "status": "subscribed" 
            };

            const updateResponse = await fetch(updateEndpoint, {
                // Using POST for updating a contact by ID (to avoid 405 error)
                method: 'POST', 
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
            console.error(`Error updating contact ${contact.id}:`, error);
            updateResults.push({ id: contact.id, error: error.message || 'Network failure during update.' });
        }
    }

    // --- 3. FINAL SUMMARY RESPONSE ---
    return new Response(JSON.stringify({ 
        success: true, 
        message: `Bulk migration complete. ${successCount} contacts successfully added to list ${DESTINATION_LIST_ID}.`,
        failures: updateResults,
        total_processed: allContacts.length
    }), { 
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
}
