// app/api/near-expiry/route.js
export const dynamic = "force-dynamic"; // always run on demand (not cached)
// export const runtime = "nodejs"; // uncomment if you prefer Node runtime on Vercel

// ====== ODOO CONFIG (use ENV VARS in production) ======
const ODOO_URL = "https://golfph.odoo.com";
const DB = "golfph";
const UID = 2; // not actually used; Odoo returns uid from authenticate
const API_KEY = "62f86f3db7ba96368763a9d85b443f58f6458e4b";

const MODEL_PARTNER = "res.partner";


// ====== FIELD NAMES (adjust if yours differ) ======
const NEAR_EXPIRY_FIELD = "x_studio_near_expiry_date"; // Date
const STATUS_FIELD = "x_studio_selection_field_33m_1j7j68j38"; // Selection
const STATUS_NEAR_EXPIRY_VALUE = "nexpire"; // selection key (not label)
const ACTIVE_FIELD = "active"; // boolean "Active" on res.partner

// ====== Helpers ======
function ymdInTZ(date, tz = "Asia/Manila") {
  const dtf = new Intl.DateTimeFormat("en-CA", { // yields YYYY-MM-DD
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = dtf.formatToParts(date).reduce((a, p) => (a[p.type] = p.value, a), {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

async function odooRpc(method, params) {
  const res = await fetch(`${ODOO_URL}/jsonrpc`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: String(Math.random()),
      method: "call",
      params: { ...params },
    }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.data?.message || JSON.stringify(json.error));
  return json.result;
}

async function authenticate() {
  const uid = await odooRpc("call", {
    service: "common",
    method: "authenticate",
    args: [DB, /* login */ null, /* api key */ API_KEY, {}],
  });
  if (!uid) throw new Error("Odoo authentication failed. Check API key.");
  return uid;
}

async function executeKw(uid, model, method, args = [], kwargs = {}) {
  return odooRpc("call", {
    service: "object",
    method: "execute_kw",
    args: [DB, uid, API_KEY, model, method, args, kwargs],
  });
}

// ====== Main handler ======
export async function GET() {
  try {
    // 1) Compute "today" in Asia/Manila
    const todayYMD = ymdInTZ(new Date(), "Asia/Manila");

    // 2) Auth
    const uid = await authenticate();

    // 3) Build domain:
    // - Active partners
    // - Near Expiry date is set
    // - Near Expiry date <= today
    // - Not already 'nexpire' (avoid needless writes)
    const domain = [
      [ACTIVE_FIELD, "=", true],
      [NEAR_EXPIRY_FIELD, "!=", false],
      [NEAR_EXPIRY_FIELD, "<=", todayYMD],
      [STATUS_FIELD, "!=", STATUS_NEAR_EXPIRY_VALUE],
    ];

    // 4) Search IDs (batch limit to be safe; increase if needed)
    const ids = await executeKw(uid, MODEL_PARTNER, "search", [domain], { limit: 5000 });

    if (!ids.length) {
      return Response.json({
        ok: true,
        message: "No partners to update",
        today: todayYMD,
        count: 0,
      });
    }

    // 5) Write status = 'nexpire'
    const writeRes = await executeKw(uid, MODEL_PARTNER, "write", [ids, {
      [STATUS_FIELD]: STATUS_NEAR_EXPIRY_VALUE,
    }]);

    return Response.json({
      ok: true,
      today: todayYMD,
      updated: Boolean(writeRes),
      count: ids.length,
      ids,
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}

