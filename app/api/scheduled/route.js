// app/api/scheduled/route.js
export const dynamic = "force-dynamic"; // don't cache

// ---- Odoo config (match your working routes) ----
const ODOO_URL = "https://golfph.odoo.com";
const DB = "golfph";
const UID = 2; // must match the user who owns the API key
const API_KEY = "62f86f3db7ba96368763a9d85b443f58f6458e4b";

// ---- Model & fields ----
const MODEL_PARTNER = "res.partner";
const ACTIVE_FIELD = "active"; // change if you use a custom flag
const NEAR_EXPIRY_FIELD = "x_studio_near_expiry_date"; // Date
const STATUS_FIELD = "x_studio_selection_field_33m_1j7j68j38"; // Selection
const STATUS_NEAR = "nexpire"; // selection KEY (not label)

// ---- Helpers ----
function ymdInTZ(date, tz = "Asia/Manila") {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  });
  const p = Object.fromEntries(fmt.formatToParts(date).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`; // YYYY-MM-DD
}

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
  if (json.error) {
    throw new Error(json.error.data?.message || json.error.message || "Odoo RPC error");
  }
  return json.result;
}

// ---- API: GET (cron/manual) ----
export async function GET(request) {
  const url = new URL(request.url);
  const dryRun = url.searchParams.has("dry") || url.searchParams.get("mode") === "dry";

  try {
    const today = ymdInTZ(new Date(), "Asia/Manila");

    // Domain: active + near_expiry set + near_expiry <= today + not already 'nexpire'
    const domain = [
      [ACTIVE_FIELD, "=", true],
      [NEAR_EXPIRY_FIELD, "!=", false],
      [NEAR_EXPIRY_FIELD, "<=", today],
      [STATUS_FIELD, "!=", STATUS_NEAR],
    ];

    // 1) find IDs (batch size big enough for your 200 members)
    const ids = await callOdoo(MODEL_PARTNER, "search", [domain], { limit: 5000 });

    if (!ids.length) {
      return Response.json({ ok: true, today, updated: 0, ids: [], dryRun });
    }

    if (dryRun) {
      return Response.json({ ok: true, today, would_update: ids.length, ids, dryRun: true });
    }

    // 2) write once for all ids
    const writeOk = await callOdoo(MODEL_PARTNER, "write", [ids, { [STATUS_FIELD]: STATUS_NEAR }]);

    return Response.json({
      ok: !!writeOk,
      today,
      updated: ids.length,
      ids,
    });
  } catch (err) {
    console.error("[scheduled] ERROR:", err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
