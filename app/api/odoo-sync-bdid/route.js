// /app/api/odoo-sync-bdid/route.js
// Purpose: Sync BD Member ID → Odoo (writes x_studio_bd_member_id if empty)

const CORS = {
  "Access-Control-Allow-Origin": "https://members.golfph.com",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

const ODOO_URL = "https://golfph.odoo.com";
const DB = "golfph";
const UID = 2;
const API_KEY = "62f86f3db7ba96368763a9d85b443f58f6458e4b";
const MODEL = "res.partner";
const FIELD = "x_studio_bd_member_id";

// 🔧 Helper function for Odoo JSON-RPC
async function callOdoo(model, method, args = [], kwargs = {}) {
  const res = await fetch(`${ODOO_URL}/jsonrpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: {
        service: "object",
        method: "execute_kw",
        args: [DB, UID, API_KEY, model, method, args, kwargs],
      },
      id: Date.now(),
    }),
  });

  const json = await res.json();
  if (json.error) throw new Error(json.error.data?.message || json.error.message);
  return json.result;
}

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: CORS });
}

// 📬 POST: Update x_studio_bd_member_id in Odoo (if empty)
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = (body.email || "").trim().toLowerCase();
    const bd_member_id = String(body.bd_member_id || "").trim();

    if (!email || !bd_member_id) {
      return new Response(
        JSON.stringify({ error: "Both email and bd_member_id are required" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    // 1️⃣ Find the Odoo contact by email
    const partner = await callOdoo(MODEL, "search_read", [[["email", "=", email]]],
      { fields: ["id", FIELD], limit: 1 });

    if (!partner?.length) {
      return new Response(
        JSON.stringify({ error: "Member not found in Odoo for this email" }),
        { status: 404, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const rec = partner[0];
    const current = (rec[FIELD] || "").toString().trim();

    // 2️⃣ Only write BD Member ID if empty
    if (!current) {
      await callOdoo(MODEL, "write", [[rec.id], { [FIELD]: bd_member_id }]);
      return new Response(
        JSON.stringify({ updated: true, partner_id: rec.id, [FIELD]: bd_member_id }),
        { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    // 3️⃣ Already set, skip
    return new Response(
      JSON.stringify({ updated: false, already_set: true, partner_id: rec.id, [FIELD]: current }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("❌ Sync error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
}
