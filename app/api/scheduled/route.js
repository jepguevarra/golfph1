// app/api/scheduled/route.js
export const dynamic = "force-dynamic"; // never cache responses

// ===== Config (prefer ENV VARS) =====
const ODOO_URL  = process.env.ODOO_URL  || "https://golfph.odoo.com";
const ODOO_DB   = process.env.ODOO_DB   || "golfph";
const ODOO_LOGIN= process.env.ODOO_LOGIN|| "leadsanalytics@gmail.com"; // <-- your Odoo email
const ODOO_API  = process.env.ODOO_API_KEY || "62f86f3db7ba96368763a9d85b443f58f6458e4b";

// Model & fields
const MODEL_PARTNER = "res.partner";
const ACTIVE_FIELD = "active"; // or change to your custom “active member” field
const NEAR_EXPIRY_FIELD = "x_studio_near_expiry_date"; // Date
const STATUS_FIELD = "x_studio_selection_field_33m_1j7j68j38"; // Selection
const STATUS_NEAR_VALUE = "nexpire"; // selection KEY (not label)

// ===== Helpers =====
function ymdInTZ(date, tz = "Asia/Manila") {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = dtf.formatToParts(date).reduce((a, p) => {
    a[p.type] = p.value; return a;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

async function odooRpc(payload) {
  const res = await fetch(`${ODOO_URL}/jsonrpc`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: String(Math.random()), ...payload }),
  });
  const json = await res.json();
  if (json.error) {
    const msg = json.error.data?.message || JSON.stringify(json.error);
    throw new Error(msg);
  }
  return json.result;
}

async function authenticate() {
  console.log("[Cron] Authenticating…");
  const uid = await odooRpc({
    method: "call",
    params: {
      service: "common",
      method: "authenticate",
      args: [ODOO_DB, ODOO_LOGIN, ODOO_API, {}],
    },
  });
  if (!uid) throw new Error("Authentication failed (uid=null). Check ODOO_LOGIN/API key/DB.");
  console.log("[Cron] Auth OK. uid =", uid);
  return uid;
}

async function executeKw(uid, model, method, args = [], kwargs = {}) {
  return odooRpc({
    method: "call",
    params: {
      service: "object",
      method: "execute_kw",
      args: [ODOO_DB, uid, ODOO_API, model, method, args, kwargs],
    },
  });
}

// ===== Main handler =====
export async function GET() {
  const startedAt = new Date().toISOString();
  try {
    const todayYMD = ymdInTZ(new Date(), "Asia/Manila");
    console.log(`[Cron] Near-expiry job start @ ${startedAt} (today=${todayYMD})`);

    const uid = await authenticate();

    // Only ACTIVE members with near_expiry_date <= today and not already 'nexpire'
    const domain = [
      [ACTIVE_FIELD, "=", true],
      [NEAR_EXPIRY_FIELD, "!=", false],
      [NEAR_EXPIRY_FIELD, "<=", todayYMD],
      [STATUS_FIELD, "!=", STATUS_NEAR_VALUE],
    ];

    console.log("[Cron] Searching partners with domain:", JSON.stringify(domain));
    const ids = await executeKw(uid, MODEL_PARTNER, "search", [domain], { limit: 5000 });
    console.log(`[Cron] Found ${ids.length} partner(s) to update`);

    if (!ids.length) {
      return Response.json({ ok: true, today: todayYMD, updated: 0, ids: [] });
    }

    // Batch update in one write call
    console.log("[Cron] Writing status 'nexpire' to IDs:", ids.slice(0, 20), ids.length > 20 ? "…(truncated)" : "");
    const writeOk = await executeKw(uid, MODEL_PARTNER, "write", [ids, {
      [STATUS_FIELD]: STATUS_NEAR_VALUE,
    }]);

    console.log(`[Cron] Write result: ${writeOk ? "OK" : "FAILED"}`);
    return Response.json({ ok: !!writeOk, today: todayYMD, updated: ids.length, ids });
  } catch (err) {
    console.error("[Cron] ERROR:", err?.message || String(err));
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}
