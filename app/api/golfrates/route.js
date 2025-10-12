// /app/api/golf_rates/route.js

// --- CORS Setup ---
const ALLOWED_ORIGIN = "https://appsumo55348.directoryup.com"; // your BD site
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

// --- Odoo Credentials ---
const ODOO_URL = "https://puddle-paper.odoo.com";
const DB = "puddle-paper";
const UID = 2; // numeric user ID
const API_KEY = "a6b8180478f3e13af0c42ed6087350df7bbbb7aa";

// --- Model Names ---
const PARENT_MODEL = "x_golf_course_rates";
const LINE_MODEL = "x_golf_course_rates_line_931dd";
const COURSE_MODEL = "x_golf_course"; // confirmed model for courses

// --- Relationship Fields ---
const REL_FIELD = "x_golf_course_rates_id"; // Many2one on line to parent
const COURSE_FIELD = "x_studio_golf_course"; // Many2one on line to course
const DESTINATION_FIELD = "x_studio_destination"; // field from x_golf_course

// --- JSON-RPC Helper ---
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
    const msg = json.error.data?.message || json.error.message || "Unknown Odoo error";
    throw new Error(`${model}.${method} failed: ${msg}`);
  }
  return json.result;
}

// --- OPTIONS (CORS Preflight) ---
export async function OPTIONS() {
  return new Response(null, { status: 200, headers: CORS_HEADERS });
}

// --- GET Request ---
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const includeAll = searchParams.get("all") === "1"; // ?all=1 to ignore dashboard filter
    const destinationFilter = searchParams.get("destination") || "";
    const limit = Math.min(parseInt(searchParams.get("limit") || "500", 10), 1000);

    // 1️⃣ Fetch parent rate sheets
    const parentDomain = includeAll ? [] : [["x_studio_show_to_dashboard", "=", true]];
    const parents = await callOdoo(
      PARENT_MODEL,
      "search_read",
      [parentDomain],
      { fields: ["id", "x_name"], limit }
    );

    if (!parents.length) {
      return new Response(JSON.stringify({
        message: "No parent records found.",
        parents: [],
        lines: [],
        count: 0,
      }), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const parentIds = parents.map(p => p.id);

    // 2️⃣ Fetch rate lines linked to those parents
    const lines = await callOdoo(
      LINE_MODEL,
      "search_read",
      [[["x_golf_course_rates_id", "in", parentIds]]],
      {
        fields: [
          "id",
          COURSE_FIELD,
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
          REL_FIELD,
        ],
        limit,
      }
    );

    if (!lines.length) {
      return new Response(JSON.stringify({
        message: "No rate lines found.",
        parents,
        lines: [],
        count: 0,
      }), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // 3️⃣ Fetch related Golf Course records for destinations
    const courseIds = Array.from(new Set(
      lines
        .map(l => Array.isArray(l[COURSE_FIELD]) ? l[COURSE_FIELD][0] : null)
        .filter(Boolean)
    ));

    const courses = courseIds.length
      ? await callOdoo(
          COURSE_MODEL,
          "search_read",
          [[["id", "in", courseIds]]],
          { fields: ["id", "x_name", DESTINATION_FIELD] }
        )
      : [];

    const courseMap = Object.fromEntries(courses.map(c => [c.id, c]));

    // 4️⃣ Combine data — attach course info to lines
    const enrichedLines = lines.map(l => {
      const courseData = Array.isArray(l[COURSE_FIELD])
        ? courseMap[l[COURSE_FIELD][0]] || {}
        : {};

      return {
        id: l.id,
        golf_course_name: l[COURSE_FIELD]?.[1] || "",
        destination: courseData[DESTINATION_FIELD] || "",
        acr_wd: l.x_studio_acr_wd,
        acr_we: l.x_studio_acr_we,
        local_wd: l.x_studio_local_wd,
        local_we: l.x_studio_local_we,
        foreign_wd: l.x_studio_foreign_wd,
        foreign_we: l.x_studio_foreign_we,
        caddy: l.x_studio_caddy,
        golf_cart: l.x_studio_golf_cart,
        consumables: l.x_studio_consumables,
        insurance: l.x_studio_insurance,
        notes: l.x_studio_notes,
        prepayment: l.x_studio_prepayment,
        promotion: l.x_studio_promotion,
      };
    });

    // 5️⃣ Optional filter by destination name
    const filtered = destinationFilter
      ? enrichedLines.filter(x =>
          (x.destination || "")
            .toLowerCase()
            .includes(destinationFilter.toLowerCase())
        )
      : enrichedLines;

    // ✅ Final Response
    return new Response(JSON.stringify({
      parents_count: parents.length,
      lines_count: filtered.length,
      parents,
      lines: filtered,
    }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Golf Rates API error:", err);
    return new Response(JSON.stringify({ error: String(err.message || err) }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
}
