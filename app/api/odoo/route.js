// /app/api/odoo/route.js
// Only updates existing Odoo partner records using BD Member ID (no creation)

const CORS = {
  "Access-Control-Allow-Origin": "https://appsumo55348.directoryup.com",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const ODOO_URL = "https://golfph.odoo.com";
const DB = "golfph";
const UID = 2;
const API_KEY = "62f86f3db7ba96368763a9d85b443f58f6458e4b";

// Helper: generic JSON-RPC call
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
  if (json.error)
    throw new Error(json.error.data?.message || json.error.message);
  return json.result;
}

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: CORS });
}

export async function POST(req) {
  try {
    const body = await req.json();

    // Basic profile fields from BD
    const name = (body?.name || "").trim();
    const email = (body?.email || "").trim();
    const phone = (body?.phone || "").trim();
    const address = (body?.address || "").trim();
    const dateJoined = (body?.date_today || "").trim();
    const dateExpiry = (body?.date_next_year || "").trim();
    const subscriptionId = Number(body?.subscription_id ?? 4);
    const bdMemberId = (body?.bd_member_id || "").trim();

    // If no BD Member ID provided — do nothing
    if (!bdMemberId) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "No BD Member ID provided. Skipping update.",
        }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    // Build update values
    const partnerVals = {
      name: name || "No name provided",
      email,
      phone,
      street: address,
      x_studio_date_joined: dateJoined || null,
      x_studio_date_expiry: dateExpiry || null,
      x_studio_subscription_plan: subscriptionId || 2,
    };

    // 🔍 Find Odoo partner by BD Member ID
    const partner = await callOdoo(
      "res.partner",
      "search_read",
      [[["x_studio_bd_member_id", "=", bdMemberId]]],
      { fields: ["id"], limit: 1 }
    );

    // ✅ If found, update the record
    if (partner.length) {
      const partnerId = partner[0].id;
      await callOdoo("res.partner", "write", [[partnerId], partnerVals]);
      return new Response(
        JSON.stringify({
          success: true,
          updated: true,
          partner_id: partnerId,
        }),
        { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    // ❌ No match → skip
    return new Response(
      JSON.stringify({
        success: false,
        message: "No matching partner found for BD Member ID. No update performed.",
      }),
      { status: 404, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("❌ Odoo route error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
}
