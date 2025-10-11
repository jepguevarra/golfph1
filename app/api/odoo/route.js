// /api/signup.js - Vercel Function
export async function POST(req) {
  try {
    const body = await req.json();

    // --- Odoo connection info ---
    const ODOO_URL = "https://puddle-paper.odoo.com";
    const DB = "puddle-paper"; // your Odoo DB name
    const USER_ID = 2; // numeric user ID (not email)
    const API_KEY = "9b66f474e1ab6da45443815a4ec0b32814e41ece"; // your Odoo API key

    // --- Prepare data from Brilliant Directories ---
    const name = body.name || "No name provided";
    const email = body.email || "";
    const phone = body.phone || "";

    // --- Build JSON-RPC payload for Odoo ---
    const payload = {
      jsonrpc: "2.0",
      method: "call",
      params: {
        service: "object",
        method: "execute_kw",
        args: [
          DB,
          USER_ID,
          API_KEY,
          "res.partner", // target model
          "create",
          [
            {
              name, // BD: bd_name
              email, // BD: bd_email
              phone, // BD: bd_cpnumber
              customer_rank: 1, // marks it as a customer
            },
          ],
        ],
      },
      id: Date.now(),
    };

    // --- Send request to Odoo ---
    const response = await fetch(`${ODOO_URL}/jsonrpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    // --- Handle response ---
    if (result.error) {
      console.error("Odoo Error:", result.error);
      return new Response(JSON.stringify({ error: result.error }), { status: 500 });
    }

    return new Response(
      JSON.stringify({ success: true, partner_id: result.result }),
      { status: 200 }
    );
  } catch (error) {
    console.error("Catch Error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
