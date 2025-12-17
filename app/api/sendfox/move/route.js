// IMPROVED CODE for app/api/sendfox/move/route.js (Handles existing list membership)

const SENDFOX_API_BASE = 'https://api.sendfox.com';
const API_TOKEN = process.env.SENDFOX_API_TOKEN;

const SOURCE_LIST_ID = 616366; 
const DESTINATION_LIST_ID = 616404; 

export async function POST(request) {
    if (!API_TOKEN) {
        return new Response(JSON.stringify({ error: 'Server configuration error: Missing API Token.' }), { status: 500 });
    }

    let allContacts = [];
    let nextUrl = `${SENDFOX_API_BASE}/lists/${SOURCE_LIST_ID}/contacts`; 

    // --- 1. FETCH CONTACT IDs FROM SOURCE LIST (Same as before) ---
    // ... (This section remains unchanged, fetches contact IDs) ...

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

    // --- 2. LOOP and SMART UPDATE EACH CONTACT ---
    const updateResults = [];
    let successCount = 0;

    for (const contact of allContacts) {
        try {
            // Get the IDs of the lists the contact is *currently* on
            const currentListIds = contact.lists.map(list => list.id);
            
            // Create a Set to ensure list IDs are unique and include the new one
            const newListsSet = new Set(currentListIds);
            newListsSet.add(DESTINATION_LIST_ID); // Add the new destination list

            const updateEndpoint = `${SENDFOX_API_BASE}/contacts/${contact.id}`;
            
            // CRITICAL FIX: Send ALL list IDs (current + new destination)
            const updatePayload = {
                "lists": Array.from(newListsSet), 
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
