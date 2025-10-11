// /app/api/odoo/route.js  (Next.js App Router)

// 🔐 CORS — allow calls from your BD site
const CORS = {
  "Access-Control-Allow-Origin": "https://appsumo55348.directoryup.com", // or "*" while testing
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: CORS });
}

export async function POST(req) {
  try {
    const body = await req.json(); // expects { name, email, phone }

    // --- Odoo credentials (use env vars in production) ---
    const ODOO_URL = "https://puddle-paper.odoo.com";
    const DB = "puddle-paper";
    // IMPORTANT: must be a numeric UID (e.g., 1), not an email or string "2"
    const UID = 2; // ← set this to your real numeric user ID
    const API_KEY = "a6b8180478f3e13af0c42ed6087350df7bbbb7aa";

    // --- Build JSON-RPC request ---
    const payload = {
      jsonrpc: "2.0",
      method: "call",
      params: {
        service: "object",
        method: "execute_kw",
        args: [
          DB,
          UID,              // numeric uid
          API_KEY,          // API key (or password)
          "res.partner",    // model
          "create",         // method
          [
            {
              name: body?.name || "No name provided",
              email: body?.email || "",
              phone: body?.phone || "",
            },
          ],
        ],
      },
      id: Date.now(),
    };

    const odooRes = await fetch(`${ODOO_URL}/jsonrpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = await odooRes.json();

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Odoo route error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
}
