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

    // existing fields
    const name = (body?.name || "").trim();
    const email = (body?.email || "").trim();
    const phone = (body?.phone || "").trim();
    const address = (body?.address || "").trim();
    const dateJoined = (body?.date_today || "").trim();
    const dateExpiry = (body?.date_next_year || "").trim();
    const subscriptionId = Number(body?.subscription_id ?? 4);

    // 👉 NEW: BD member id
    const bdMemberId = (body?.bd_member_id ?? "").toString().trim();

    if (!name && !email && !phone) {
      return new Response(
        JSON.stringify({ error: "Missing required data (name/email/phone)" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    // Odoo creds
    const ODOO_URL = "https://golfph.odoo.com";
    const DB = "golfph";
    const UID = 2;
    const API_KEY = "62f86f3db7ba96368763a9d85b443f58f6458e4b";

    // build partner values
    const partnerVals = {
      name: name || "No name provided",
      email,
      phone,
      street: address,
      x_studio_date_joined: dateJoined || null,
      x_studio_date_expiry: dateExpiry || null,
      x_studio_subscription_plan: subscriptionId || 2,
      // 👉 NEW: store BD member id
      x_studio_bd_member_id: bdMemberId || null,
    };

    const payload = {
      jsonrpc: "2.0",
      method: "call",
      params: {
        service: "object",
        method: "execute_kw",
        args: [
          DB,
          UID,
          API_KEY,
          "res.partner",
          "create",
          [partnerVals],
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
    console.error("❌ Odoo route error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
}
