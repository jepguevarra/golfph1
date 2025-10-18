// /app/api/odoo/route.js
// Update existing Odoo partner using BD Member ID ONLY (no create)

const ORIGIN = "https://appsumo55348.directoryup.com";

const CORS = {
  "Access-Control-Allow-Origin": ORIGIN,        // must NOT be '*'
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Credentials": "true",   // allow credentialed requests if used
};

const ODOO_URL = "https://golfph.odoo.com";
const DB = "golfph";
const UID = 2;
const API_KEY = "62f86f3db7ba96368763a9d85b443f58f6458e4b";

// Generic JSON-RPC caller
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
  // Preflight response
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(req) {
  try {
    const body = await req.json();

    // Incoming fields from BD
    const bdMemberId    = (body?.bd_member_id || "").trim(); // REQUIRED
    const name          = (body?.name || "").trim();
    const email         = (body?.email || "").trim();
    const phone         = (body?.phone || "").trim();
    const address       = (body?.address || "").trim();
    const dateJoined    = (body?.date_today || "").trim();
    const dateExpiry    = (body?.date_next_year || "").trim();
    const subscriptionId= Number(body?.subscription_id ?? 0);

    // If no BD Member ID — do nothing
    if (!bdMemberId) {
      return new Response(
        JSON.stringify({ success: false, message: "No BD Member ID provided. Skipping update." }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    // Build update payload with ONLY non-empty fields (avoid blanking data)
    const updateVals = {};
    if (name)         updateVals.name = name;
    if (email)        updateVals.email = email;
    if (phone)        updateVals.phone = phone;
    if (address)      updateVals.street = address;
    if (dateJoined)   updateVals.x_studio_date_joined = dateJoined;
    if (dateExpiry)   updateVals.x_studio_date_expiry  = dateExpiry;
    if (subscriptionId > 0) updateVals.x_studio_subscription_plan = subscriptionId;

    if (Object.keys(updateVals).length === 0) {
      return new Response(
        JSON.stringify({ success: false, message: "No updatable fields provided." }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    // Find partner by BD Member ID
    const partner = await callOdoo(
      "res.partner",
      "search_read",
      [[["x_studio_bd_member_id", "=", bdMemberId]]],
      { fields: ["id"], limit: 1 }
    );

    if (!partner.length) {
      return new Response(
        JSON.stringify({ success: false, message: "No matching partner found for BD Member ID. No update performed." }),
        { status: 404, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const partnerId = partner[0].id;
    await callOdoo("res.partner", "write", [[partnerId], updateVals]);

    return new Response(
      JSON.stringify({ success: true, updated: true, partner_id: partnerId, fields: updateVals }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("❌ Odoo route error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
}
