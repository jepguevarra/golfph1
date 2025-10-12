// /app/api/golf_rates/route.js

const ALLOWED_ORIGIN = "https://appsumo55348.directoryup.com";
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

// --- Odoo credentials ---
const ODOO_URL = "https://puddle-paper.odoo.com";
const DB = "puddle-paper";
const UID = 2;
const API_KEY = "a6b8180478f3e13af0c42ed6087350df7bbbb7aa";

// --- Model names ---
const PARENT_MODEL = "x_golf_course_rates";
const LINE_MODEL = "x_golf_course_rates_line_931dd";
const O2M_FIELD = "x_studio_green_fee";
const REL_FIELD = "x_golf_course_rates_id"; // relation back to parent

// --- Helper: JSON-RPC with kwargs ---
async function callOdoo(model, method, args = [], kwargs = {}) {
  const response = await fetch(`${ODOO_URL}/jsonrpc`, {
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

  const json = await response.json();
  if (json.error) {
    const msg = (json.error.data && json.error.data.message) || json.error.message || "Unknown Odoo error";
    throw new Error(`${model}.${method} failed: ${msg}`);
  }
  return json.result;
}

// --- OPTIONS ---
export async function OPTIONS() {
  return new Response(null, { status: 200, headers: CORS_HEADERS });
}

// --- GET ---
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const includeAll = searchParams.get("all") === "1";
    const destination = searchParams.get("destination") || "";
    const limit = Math.min(parseInt(searchParams.get("limit") || "200", 10), 1000);

    // 1️⃣ Fetch parent records (optionally filtered)
    const parentDomain = includeAll ? [] : [["x_studio_show_to_dashboard", "=", true]];

    const parents = await callOdoo(
      PARENT_MODEL,
      "search_read",
      [parentDomain],
      { fields: ["id", "display_name", O2M_FIELD], limit }
    );

    if (!parents.length) {
      return new Response(
        JSON.stringify({ parents: [], lines: [], note: "No parent records found" }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // 2️⃣ Determine which line records to load
    const parentIds = parents.map((p) => p.id);
    const o2mIds = parents.flatMap((p) => Array.isArray(p[O2M_FIELD]) ? p[O2M_FIELD] : []);

    let lineDomain = o2mIds.length
      ? [["id", "in", o2mIds]]
      : [[REL_FIELD, "in", parentIds]];

    // If user passes a destination, apply it to related field
    if (destination) {
      lineDomain.push(["x_studio_golf_course.x_studio_destination", "ilike", destination]);
    }

    // 3️⃣ Fetch lines with dot-notation field
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
          "x_studio_foreign_wd",
          "x_studio_foreign_we",
          "x_studio_golf_cart",
          "x_studio_insurance",
          "x_studio_local_wd",
          "x_studio_local_we",
          "x_studio_notes",
          "x_studio_prepayment",
          "x_studio_promotion",
          "x_studio_golf_course", // Many2one (id, name)
          "x_studio_golf_course.x_studio_destination", // related field
          REL_FIELD,
        ],
        limit,
      }
    );

    // 4️⃣ Return combined payload
    const responsePayload = {
      parents_count: parents.length,
      lines_count: lines.length,
      parents,
      lines,
    };

    return new Response(JSON.stringify(responsePayload), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Golf Rates API Error:", err);
    return new Response(JSON.stringify({ error: String(err.message) }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
}
