// golfph1/app/api/sendfox/sendfox-list.js

// Using 'node-fetch' or similar for a clean HTTP request, 
// but you can also use the native 'https' module.
const fetch = require('node-fetch');

// The SendFox API base URL
const SENDFOX_API_BASE = 'https://api.sendfox.com';

// 1. Get your Personal Access Token from your SendFox account settings -> API.
// 2. Set it as an environment variable in Vercel (e.g., SENDFOX_API_TOKEN).
const API_TOKEN = process.env.SENDFOX_API_TOKEN;

export default async (req, res) => {
    // 1. Only allow GET requests for fetching the list.
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    if (!API_TOKEN) {
        // Essential security check: make sure the token is set.
        console.error('SENDFOX_API_TOKEN is not set in environment variables.');
        return res.status(500).json({ error: 'Server configuration error.' });
    }

    const endpoint = `${SENDFOX_API_BASE}/lists`;

    try {
        // 2. Make the GET request to the SendFox API
        const response = await fetch(endpoint, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${API_TOKEN}`,
                'Content-Type': 'application/json',
                // SendFox might not strictly require 'Content-Type' for GET, 
                // but it's good practice.
            },
        });

        // 3. Handle SendFox API response status
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`SendFox API error (${response.status}): ${errorText}`);
            return res.status(response.status).json({ 
                error: 'Failed to fetch lists from SendFox', 
                detail: errorText 
            });
        }

        // 4. Parse and return the contact list data
        const data = await response.json();
        
        // The SendFox /lists endpoint returns paginated data (e.g., { data: [/*lists*/], current_page: 1, ...})
        // You might want to return only the list array 'data' to your Odoo client.
        const contactLists = data.data || [];
        
        // Filter the essential list info you need for Odoo (ID, Name)
        const simplifiedLists = contactLists.map(list => ({
            id: list.id,
            name: list.name,
            // You can add other useful fields like contact count if the API provides it.
        }));
        
        return res.status(200).json(simplifiedLists);

    } catch (error) {
        // 5. Handle network or other unexpected errors
        console.error('An unexpected error occurred:', error);
        return res.status(500).json({ 
            error: 'Internal Server Error', 
            detail: error.message 
        });
    }
};
