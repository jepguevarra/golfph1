// /app/api/odoo/route.js

const CORS = {
  "Access-Control-Allow-Origin": "https://appsumo55348.directoryup.com",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: CORS });
}

export async function POST(req) {
  try {
    const body = await req.json();

    // Extract all expected fields
    const name = (body?.name || "").trim();
    const email = (body?.email || "").trim();
    const phone = (body?.phone || "").trim();
    const address = (body?.address || "").trim();
    const dateJoined = (body?.date_today || "").trim();
    const dateExpiry = (body?.date_next_year || "").trim();
    const subscriptionId = Number(body?.subscription_id ?? 4);
    const bdMemberId = (body?.bd_member_id ?? "").toString().trim();

    if (!email && !phone) {
      return new Response(
        JSON.stringify({ error: "Missing key identity (email or phone)" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    // --- 🔐 Odoo credentials ---
    const ODOO_URL = "https://golfph.odoo.com";
    const DB = "golfph";
    const UID = 2;
    const API_KEY = "62f86f3db7ba96368763a9d85b443f58f6458e4b";

    // --- helper for Odoo JSON-RPC calls ---
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

    // 🔍 Try to find existing partner
    let partnerId = null;
    if (bdMemberId) {
      const found = await callOdoo(
        "res.partner",
        "search",
        [[["x_studio_bd_member_id", "=", bdMemberId]]],
        { limit: 1 }
      );
      if (Array.isArray(found) && found.length) partnerId = found[0];
    }

    if (!partnerId && email) {
      const found = await callOdoo(
        "res.partner",
        "search",
        [[["email", "=", email]]],
        { limit: 1 }
      );
      if (Array.isArray(found) && found.length) partnerId = found[0];
    }

    // Common partner values
    const partnerVals = {
      name: name || "No name provided",
      email,
      phone,
      street: address,
      x_studio_date_joined: dateJoined || null,
      x_studio_date_expiry: dateExpiry || null,
      x_studio_subscription_plan: subscriptionId || 2,
      x_studio_bd_member_id: bdMemberId || null,
    };

    let result;
    if (partnerId) {
      // 🔁 Update existing record
      await callOdoo("res.partner", "write", [[partnerId], partnerVals]);
      result = { updated: true, partner_id: partnerId };
    } else {
      // 🆕 Create new record
      const newId = await callOdoo("res.partner", "create", [partnerVals]);
      result = { created: true, partner_id: newId };
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("❌ Odoo route error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
}
