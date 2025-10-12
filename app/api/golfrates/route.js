// /app/api/golf_rates/route.js

const ALLOWED_ORIGIN = "https://appsumo55348.directoryup.com"; // Your BD site
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

// --- Odoo credentials ---
const ODOO_URL = "https://puddle-paper.odoo.com";
const DB = "puddle-paper";
const UID = 2; // numeric user id (not email)
const API_KEY = "a6b8180478f3e13af0c42ed6087350df7bbbb7aa"; // your Odoo API key

// --- Helper function to call Odoo JSON-RPC ---
async function callOdoo(method, model, args = []) {
  const response = await fetch(`${ODOO_URL}/jsonrpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: {
        service: "object",
        method: "execute_kw",
        args: [DB, UID, API_KEY, model, method, args],
      },
      id: Date.now(),
    }),
  });

  const data = await response.json();
  return data.result;
}

// --- OPTIONS (CORS preflight) ---
export async function OPTIONS() {
  return new Response(null, { status: 200, headers: CORS_HEADERS });
}

// --- GET Request to fetch all golf rates ---
export async function GET() {
  try {
    // Step 1: Fetch all parent golf rate records (no dashboard filter)
    const visibleParents = await callOdoo("search_read", "x_golf_course_rates", [
      [], // 👈 No filter — fetch all records
      { fields: ["id", "x_name"], limit: 50 },
    ]);

    if (!visibleParents || !visibleParents.length) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const parentIds = visibleParents.map((r) => r.id);

    // Step 2: Fetch related lines from x_golf_course_rates_line_931dd
    const lines = await callOdoo(
      "search_read",
      "x_golf_course_rates_line_931dd",
      [
        [["x_studio_golf_course", "in", parentIds]],
        {
          fields: [
            "x_studio_acr_wd",
            "x_studio_acr_we",
            "x_studio_caddy",
            "x_studio_consumables",
            "x_studio_destination",
            "x_studio_foreign_wd",
            "x_studio_foreign_we",
            "x_studio_golf_cart",
            "x_studio_golf_course",
            "x_studio_insurance",
            "x_studio_local_wd",
            "x_studio_local_we",
            "x_studio_notes",
            "x_studio_prepayment",
            "x_studio_promotion",
          ],
          limit: 100,
        },
      ]
    );

    // Step 3: Return combined parent + lines data
    const responsePayload = {
      parents: visibleParents,
      lines: lines || [],
      count: lines?.length || 0,
    };

    return new Response(JSON.stringify(responsePayload), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error fetching golf rates:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
}
