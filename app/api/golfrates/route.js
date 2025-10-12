// /app/api/golf_rates/route.js

const ALLOWED_ORIGIN = "https://appsumo55348.directoryup.com"; // tighten as needed
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

// --- Technical names (from your message) ---
const PARENT_MODEL = "x_golf_course_rates";
const LINE_MODEL   = "x_golf_course_rates_line_931dd";
const O2M_FIELD    = "x_studio_green_fee";       // one2many on parent
const REL_FIELD    = "x_golf_course_rates_id";   // many2one on line back to parent

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
    const msg =
      (json.error.data && json.error.data.message) ||
      json.error.message ||
      "Unknown Odoo error";
    throw new Error(`${model}.${method} failed: ${msg}`);
  }
  return json.result;
}

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: CORS_HEADERS });
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);

    // Optional toggles / filters
    const includeAll = searchParams.get("all") === "1"; // if 1, ignore dashboard flag
    const destination = searchParams.get("destination"); // optional ilike filter on lines
    const limit = Math.min(parseInt(searchParams.get("limit") || "200", 10), 1000);

    // 1) Fetch parents (optionally filter by show_to_dashboard)
    const parentDomain = includeAll
      ? [] // no filter
      : [["x_studio_show_to_dashboard", "=", true]];

    const parents = await callOdoo(PARENT_MODEL, "search_read", [
      parentDomain,
      { fields: ["id", "x_name", O2M_FIELD], limit },
    ]);

    if (!parents.length) {
      return new Response(
        JSON.stringify({
          parents_count: 0,
          lines_count: 0,
          parents: [],
          lines: [],
          note: includeAll
            ? `No records found in ${PARENT_MODEL}.`
            : `No records found with x_studio_show_to_dashboard = true in ${PARENT_MODEL}. Try ?all=1 to ignore the flag.`,
        }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // Collect line IDs from the one2many field if present
    const allLineIds = parents
      .map(p => Array.isArray(p[O2M_FIELD]) ? p[O2M_FIELD] : [])
      .flat();

    // Fallback: if O2M is empty (depends on how Studio populates search_read),
    // build domain using the relation field on lines.
    let lineDomain;
    if (allLineIds.length) {
      lineDomain = [["id", "in", allLineIds]];
    } else {
      const parentIds = parents.map(p => p.id);
      lineDomain = [[REL_FIELD, "in", parentIds]];
    }

    if (destination) {
      lineDomain.push(["x_studio_destination", "ilike", destination]);
    }

    // 2) Fetch line records using the correct relation field
    const lines = await callOdoo(LINE_MODEL, "search_read", [
      lineDomain,
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
          REL_FIELD, // include the many2one back to parent
        ],
        limit,
      },
    ]);

    return new Response(
      JSON.stringify({
        parents_count: parents.length,
        lines_count: lines.length,
        parents,
        lines,
      }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("golf_rates error:", err);
    return new Response(JSON.stringify({ error: String(err.message || err) }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
}
