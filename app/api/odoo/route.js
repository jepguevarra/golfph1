export async function POST(req) {
  try {
    const body = await req.json();

    // --- Odoo credentials ---
    const ODOO_URL = "https://puddle-paper.odoo.com";
    const DB = "puddle-paper"; // database name (check from Odoo URL or About page)
    const USER = "2"; // your Odoo login email
    const API_KEY = "c4fe251e46429be275daffb7147bda157d19aff5"; // your API key

    // --- Prepare the JSON-RPC request ---
    const response = await fetch(`${ODOO_URL}/jsonrpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "call",
        params: {
          service: "object",
          method: "execute_kw",
          args: [
            DB,
            USER, // email instead of user_id
            API_KEY,
            "res.partner", // your custom model
            "create",
            [
              {
                name: body.name || "No name provided",
                email: body.email || "",
                phone: body.phone || "",
              },
            ],
          ],
        },
        id: new Date().getTime(),
      }),
    });

    const result = await response.json();

    // --- Return the Odoo result ---
    return new Response(JSON.stringify(result), { status: 200 });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
