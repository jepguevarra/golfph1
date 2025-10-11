// /app/api/odoo/route.js

// ----- CORS -----
const ALLOWED_ORIGINS = new Set([
  "https://appsumo55348.directoryup.com", // BD site
  // add more if needed:
  // "https://golfph1.vercel.app",
  // "https://<your-custom-domain>"
]);

function corsHeaders(origin) {
  const allowOrigin = ALLOWED_ORIGINS.has(origin) ? origin : "https://appsumo55348.directoryup.com";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    // If you *ever* switch the client to credentials: "include",
    // uncomment the next line and ensure allowOrigin is a single exact origin (not "*"):
    // "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
  };
}

export async function OPTIONS(req) {
  const origin = req.headers.get("origin") || "";
  return new Response(null, { status: 200, headers: corsHeaders(origin) });
}

// ----- Odoo JSON-RPC helper -----
async function odooRpc({ url, db, uid, apiKey, model, method, args = [], kwargs = {} }) {
  const payload = {
    jsonrpc: "2.0",
    method: "call",
    params: {
      service: "object",
      method: "execute_kw",
      args: [db, uid, apiKey, model, method, args, kwargs],
    },
    id: Date.now(),
  };

  const res = await fetch(`${url}/jsonrpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // Do NOT send credentials/cookies to Odoo here
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (data?.error) {
    const msg = data.error?.data?.message || data.error?.message || "Odoo RPC error";
    throw new Error(msg);
  }
  return data.result;
}

export async function POST(req) {
  const origin = req.headers.get("origin") || "";
  try {
    // Body is JSON from your widget
    const body = await req.json();

    // Extract & normalize
    const name = String(body?.name || "").trim();
    const email = String(body?.email || "").trim().toLowerCase();
    const phone = String(body?.phone || "").trim();
    const address = String(body?.address || "").trim();
    const dateJoined = String(body?.date_today || "").trim();      // YYYY-MM-DD
    const dateExpiry = String(body?.date_next_year || "").trim();  // YYYY-MM-DD
    const subscriptionId = Number(body?.subscription_id ?? 2);     // Many2one id

    if (!name && !email && !phone) {
      return new Response(
        JSON.stringify({ ok: false, error: "Missing required data (name/email/phone)" }),
        { status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" } }
      );
    }

    // ----- Odoo credentials (move to env vars in production) -----
    const ODOO_URL = "https://puddle-paper.odoo.com";
    const DB = "puddle-paper";
    const UID = 2; // MUST be your numeric user ID
    const API_KEY = "a6b8180478f3e13af0c42ed6087350df7bbbb7aa";

    // Build vals for res.partner
    const vals = {
      name: name || "No name provided",
      email: email || undefined,
      phone: phone || undefined,
      street: address || undefined, // combined address into one line
    };

    // Only set valid YYYY-MM-DD strings
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateJoined))  vals.x_studio_date_joined = dateJoined;
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateExpiry))  vals.x_studio_date_expiry = dateExpiry;

    // Many2one expects an integer record ID
    if (Number.isInteger(subscriptionId) && subscriptionId > 0) {
      vals.x_studio_subscription_plan = subscriptionId;
    }

    // ----- Idempotency: if email exists, update; else create -----
    let result;
    if (email) {
      // search([('email', '=', email)], limit=1)
      const foundIds = await odooRpc({
        url: ODOO_URL, db: DB, uid: UID, apiKey: API_KEY,
        model: "res.partner", method: "search",
        args: [[["email", "=", email]]], kwargs: { limit: 1 },
      });

      if (Array.isArray(foundIds) && foundIds.length) {
        const partnerId = foundIds[0];

        // write([id], vals)
        const writeOk = await odooRpc({
          url: ODOO_URL, db: DB, uid: UID, apiKey: API_KEY,
          model: "res.partner", method: "write",
          args: [[partnerId], vals],
        });

        result = { ok: true, updated_id: partnerId, write_ok: writeOk === true };
      } else {
        // create(vals)
        const newId = await odooRpc({
          url: ODOO_URL, db: DB, uid: UID, apiKey: API_KEY,
          model: "res.partner", method: "create",
          args: [vals],
        });

        result = { ok: true, created_id: newId };
      }
    } else {
      // No email → just create
      const newId = await odooRpc({
        url: ODOO_URL, db: DB, uid: UID, apiKey: API_KEY,
        model: "res.partner", method: "create",
        args: [vals],
      });
      result = { ok: true, created_id: newId };
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("❌ Odoo route error:", error);
    return new Response(JSON.stringify({ ok: false, error: String(error?.message || error) }), {
      status: 500,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }
}
