// /app/api/odoo/route.js

const CORS = {
  "Access-Control-Allow-Origin": "https://appsumo55348.directoryup.com", // adjust as needed
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: CORS });
}

export async function POST(req) {
  try {
    const body = await req.json();

    // Extract payload
    const name = (body?.name || "").trim();
    const email = (body?.email || "").trim().toLowerCase();
    const phone = (body?.phone || "").trim();
    const address = (body?.address || "").trim();
    const dateJoined = (body?.date_today || "").trim();
    const dateExpiry = (body?.date_next_year || "").trim();
    const subscriptionId = Number(body?.subscription_id ?? 2);

    if (!name && !email && !phone) {
      return new Response(JSON.stringify({ error: "Missing required data (name/email/phone)" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    // Odoo credentials
    const ODOO_URL = "https://puddle-paper.odoo.com";
    const DB = "puddle-paper";
    const UID = 2; // numeric uid
    const API_KEY = "a6b8180478f3e13af0c42ed6087350df7bbbb7aa";

    // Build values
    const vals = {
      name: name || "No name provided",
      email: email || undefined,
      phone: phone || undefined,
      street: address || undefined,
    };
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateJoined))  vals.x_studio_date_joined = dateJoined;
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateExpiry))  vals.x_studio_date_expiry = dateExpiry;
    if (Number.isInteger(subscriptionId) && subscriptionId > 0) {
      vals.x_studio_subscription_plan = subscriptionId; // many2one id
    }

    // Helper to call JSON-RPC
    async function rpc(payload) {
      const res = await fetch(`${ODOO_URL}/jsonrpc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return res.json();
    }

    // 1) If we have an email, check for an existing partner
    let existingId = null;
    if (email) {
      const searchPayload = {
        jsonrpc: "2.0",
        method: "call",
        params: {
          service: "object",
          method: "execute_kw",
          args: [
            DB, UID, API_KEY,
            "res.partner", "search",
            [[["email", "=", email]]],
            { limit: 1 }
          ],
        },
        id: Date.now(),
      };
      const searchRes = await rpc(searchPayload);
      if (Array.isArray(searchRes?.result) && searchRes.result.length) {
        existingId = searchRes.result[0];
      }
    }

    let result;
    if (existingId) {
      // 2) Update existing partner
      const writePayload = {
        jsonrpc: "2.0",
        method: "call",
        params: {
          service: "object",
          method: "execute_kw",
          args: [DB, UID, API_KEY, "res.partner", "write", [[existingId], vals]],
        },
        id: Date.now() + 1,
      };
      const writeRes = await rpc(writePayload);
      result = { updated_id: existingId, write_ok: writeRes?.result === true };
    } else {
      // 3) Create new partner
      const createPayload = {
        jsonrpc: "2.0",
        method: "call",
        params: {
          service: "object",
          method: "execute_kw",
          args: [DB, UID, API_KEY, "res.partner", "create", [vals]],
        },
        id: Date.now() + 2,
      };
      const createRes = await rpc(createPayload);
      result = { created_id: createRes?.result || null };
    }

    return new Response(JSON.stringify({ ok: true, ...result }), {
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
