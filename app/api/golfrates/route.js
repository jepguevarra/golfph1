// /app/api/golf_rates/route.js

// --- CORS Setup ---
const ALLOWED_ORIGIN = "https://appsumo55348.directoryup.com";
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

// --- Models & Fields ---
const PARENT_MODEL = "x_golf_course_rates";
const LINE_MODEL = "x_golf_course_rates_line_931dd";
const COURSE_MODEL = "x_golf_course";
const PARTNER_MODEL = "res.partner";

const REL_FIELD = "x_golf_course_rates_id";       // line -> parent m2o
const COURSE_FIELD = "x_studio_golf_course";      // line -> course m2o
const DESTINATION_FIELD = "x_studio_destination"; // on x_golf_course

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

    // ✅ Member lookup branch: /api/golf_rates?member_email=...
    const memberEmail = (searchParams.get("member_email") || "").trim();
    if (memberEmail) {
      // case-insensitive email lookup (limit 1)
      const partners = await callOdoo(
        PARTNER_MODEL,
        "search_read",
        [[["email", "ilike", memberEmail]]],
        { fields: ["id", "name", "email", "x_studio_free_buddy_passes", "x_studio_golf_ph_priveledge_card_no"], limit: 1 }
      );

      const data = partners?.[0] || null;
      return new Response(JSON.stringify({ member: data }), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // ✅ Rates branch (your existing logic)
    const includeAll = searchParams.get("all") === "1"; // ?all=1 ignore dashboard flag
    const destinationFilter = searchParams.get("destination") || "";
    const limit = Math.min(parseInt(searchParams.get("limit") || "500", 10), 1000);

    // 1) Parents
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

    // 2) Lines (+prepayment, +consumables)
    const lines = await callOdoo(
      LINE_MODEL,
      "search_read",
      [[ [REL_FIELD, "in", parentIds] ]],
      {
        fields: [
          "id",
          COURSE_FIELD,                // [id, name]
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
          "x_studio_prepayment",       // boolean
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

    // 3) Course destinations
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

    // 4) Enrich lines
    const enriched = lines.map(l => {
      const courseM2O = l[COURSE_FIELD];
      const courseId = Array.isArray(courseM2O) ? courseM2O[0] : null;
      const courseName = Array.isArray(courseM2O) ? courseM2O[1] : "";
      const courseInfo = (courseId && courseMap[courseId]) || {};
      const destination = courseInfo[DESTINATION_FIELD] || "";

      return {
        id: l.id,
        golf_course_name: courseName,
        destination,
        acr_wd: l.x_studio_acr_wd,
        acr_we: l.x_studio_acr_we,
        local_wd: l.x_studio_local_wd,
        local_we: l.x_studio_local_we,
        foreign_wd: l.x_studio_foreign_wd,
        foreign_we: l.x_studio_foreign_we,
        caddy: l.x_studio_caddy,
        golf_cart: l.x_studio_golf_cart,
        insurance: l.x_studio_insurance,
        consumables: l.x_studio_consumables,
        prepayment: !!l.x_studio_prepayment,
        notes: l.x_studio_notes,
        promotion: l.x_studio_promotion,
      };
    });

    // 5) Optional destination filter (client-side)
    const filtered = destinationFilter
      ? enriched.filter(x =>
          (x.destination || "").toLowerCase().includes(destinationFilter.toLowerCase())
        )
      : enriched;

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
