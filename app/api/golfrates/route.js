// /app/api/golf_rates/route.js

// --- CORS ---
const ALLOWED_ORIGIN = "https://appsumo55348.directoryup.com"; // tighten to your BD domain
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

// --- Odoo credentials ---
const ODOO_URL = "https://puddle-paper.odoo.com";
const DB = "puddle-paper";
const UID = 2; // numeric user id that owns the API key
const API_KEY = "a6b8180478f3e13af0c42ed6087350df7bbbb7aa";

// --- Technical names (from your setup) ---
const PARENT_MODEL = "x_golf_course_rates";
const LINE_MODEL   = "x_golf_course_rates_line_931dd";
const O2M_FIELD    = "x_studio_green_fee";     // one2many on parent
const REL_FIELD    = "x_golf_course_rates_id"; // many2one on line back to parent

// --- JSON-RPC helper (supports kwargs) ---
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
    const msg = (json.error.data && json.error.data.message) || json.error.message || "Unknown Odoo error";
    throw new Error(`${model}.${method} failed: ${msg}`);
  }
  return json.result;
}

// --- OPTIONS (preflight) ---
export async function OPTIONS() {
  return new Response(null, { status: 200, headers: CORS_HEADERS });
}

// --- GET: fetch golf course rates ---
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const includeAll = searchParams.get("all") === "1";              // ignore dashboard flag if ?all=1
    const destination = searchParams.get("destination") || "";       // optional line filter
    const limit = Math.min(parseInt(searchParams.get("limit") || "200", 10), 1000);

    // 1) Parents: optionally filter by show_to_dashboard (unset while testing with ?all=1)
    const parentDomain = includeAll ? [] : [["x_studio_show_to_dashboard", "=", true]];

    const parents = await callOdoo(
      PARENT_MODEL,
      "search_read",
      [parentDomain],
      { fields: ["id", "display_name", O2M_FIELD], limit }
    );

    if (!parents || parents.length === 0) {
      return new Response(JSON.stringify({
        parents_count: 0,
        lines_count: 0,
        parents: [],
        lines: [],
        note: includeAll
          ? `No records found in ${PARENT_MODEL}.`
          : `No records with x_studio_show_to_dashboard = true. Try adding ?all=1 to ignore the flag.`,
      }), { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
    }

    // Prefer O2M IDs if present (some Studio setups return them), else fallback to relation domain
    const o2mIds = parents.flatMap(p => Array.isArray(p[O2M_FIELD]) ? p[O2M_FIELD] : []);
    const parentIds = parents.map(p => p.id);

    let lineDomain = o2mIds.length
      ? [["id", "in", o2mIds]]
      : [[REL_FIELD, "in", parentIds]];

    if (destination) {
      lineDomain.push(["x_studio_destination", "ilike", destination]);
    }

    // 2) Lines: use correct relation field back to parent
    const lines = await callOdoo(
      LINE_MODEL,
      "search_read",
      [lineDomain],
      {
        fields: [
          "x_studio_acr_wd",
          "x_studio_acr_we",
          "x_studio_caddy",
          "x_studio_consumables",
          "x_studio_destination",
          "x_studio_foreign_wd",
          "x_studio_foreign_we",
          "x_studio_golf_cart",
          "x_studio_insurance",
          "x_studio_local_wd",
          "x_studio_local_we",
          "x_studio_notes",
          "x_studio_prepayment",
          "x_studio_promotion",
          REL_FIELD, // returns [parent_id, parent_name]
        ],
        limit,
      }
    );

    return new Response(JSON.stringify({
      parents_count: parents.length,
      lines_count: lines.length,
      parents,
      lines,
    }), { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("golf_rates error:", err);
    return new Response(JSON.stringify({ error: String(err.message || err) }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
}
