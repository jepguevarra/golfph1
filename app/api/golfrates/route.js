// /app/api/golf_rates/route.js

const ALLOWED_ORIGIN = "https://appsumo55348.directoryup.com"; // BD domain
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

// --- Model references ---
const PARENT_MODEL = "x_golf_course_rates";
const LINE_MODEL = "x_golf_course_rates_line_931dd";
const COURSE_MODEL = "x_golf_courses"; // Model where destination actually exists
const O2M_FIELD = "x_studio_green_fee"; // one2many link field on parent
const REL_FIELD = "x_golf_course_rates_id"; // many2one link back to parent

// --- Helper for JSON-RPC calls ---
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
    const msg = (json.error.data && json.error.data.message) || json.error.message;
    throw new Error(`${model}.${method} failed: ${msg}`);
  }
  return json.result;
}

// --- OPTIONS handler ---
export async function OPTIONS() {
  return new Response(null, { status: 200, headers: CORS_HEADERS });
}

// --- GET handler ---
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const includeAll = searchParams.get("all") === "1";
    const destinationFilter = searchParams.get("destination") || "";
    const limit = Math.min(parseInt(searchParams.get("limit") || "500", 10), 1000);

    // 1️⃣ Fetch parent rate records
    const parentDomain = includeAll ? [] : [["x_studio_show_to_dashboard", "=", true]];
    const parents = await callOdoo(PARENT_MODEL, "search_read", [parentDomain], {
      fields: ["id", "display_name", O2M_FIELD],
      limit,
    });

    if (!parents.length) {
      return new Response(
        JSON.stringify({ message: "No visible golf rate parents found", parents: [], lines: [] }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const parentIds = parents.map((p) => p.id);
    const o2mIds = parents.flatMap((p) => Array.isArray(p[O2M_FIELD]) ? p[O2M_FIELD] : []);

    // 2️⃣ Fetch line records
    const lineDomain = o2mIds.length
      ? [["id", "in", o2mIds]]
      : [[REL_FIELD, "in", parentIds]];

    const lines = await callOdoo(LINE_MODEL, "search_read", [lineDomain], {
      fields: [
        "id",
        "x_studio_golf_course", // Many2one (Golf Course)
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
    });

    if (!lines.length) {
      return new Response(
        JSON.stringify({ message: "No lines found for visible golf courses", parents, lines: [] }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // 3️⃣ Collect Golf Course IDs and query destinations
    const golfCourseIds = Array.from(
      new Set(
        lines
          .map((l) => Array.isArray(l.x_studio_golf_course) ? l.x_studio_golf_course[0] : null)
          .filter(Boolean)
      )
    );

    let courseMap = {};
    if (golfCourseIds.length) {
      const courses = await callOdoo(COURSE_MODEL, "search_read", [[["id", "in", golfCourseIds]]], {
        fields: ["id", "display_name", "x_studio_destination"],
        limit: golfCourseIds.length,
      });
      courseMap = Object.fromEntries(courses.map((c) => [c.id, c]));
    }

    // 4️⃣ Merge destinations into lines
    const mergedLines = lines.map((l) => {
      const courseInfo = Array.isArray(l.x_studio_golf_course)
        ? courseMap[l.x_studio_golf_course[0]]
        : null;
      return {
        ...l,
        golf_course_name: Array.isArray(l.x_studio_golf_course)
          ? l.x_studio_golf_course[1]
          : "",
        destination: courseInfo?.x_studio_destination || "N/A",
      };
    });

    // 5️⃣ Apply destination filter (case-insensitive)
    const filteredLines = destinationFilter
      ? mergedLines.filter((l) =>
          l.destination.toLowerCase().includes(destinationFilter.toLowerCase())
        )
      : mergedLines;

    // 6️⃣ Final response
    const responsePayload = {
      parents_count: parents.length,
      lines_count: filteredLines.length,
      parents,
      lines: filteredLines,
    };

    return new Response(JSON.stringify(responsePayload), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error in /api/golf_rates:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
}
