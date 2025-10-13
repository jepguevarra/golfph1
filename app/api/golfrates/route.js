// /app/api/golf_rates/route.js

// --- CORS Setup ---
const ALLOWED_ORIGIN = "https://appsumo55348.directoryup.com";
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

// --- Odoo Credentials ---
const ODOO_URL = "https://puddle-paper.odoo.com";
const DB = "puddle-paper";
const UID = 2; // numeric user ID
const API_KEY = "a6b8180478f3e13af0c42ed6087350df7bbbb7aa";

// --- Models ---
const PARENT_MODEL = "x_golf_course_rates";
const LINE_MODEL = "x_golf_course_rates_line_931dd";
const COURSE_MODEL = "x_golf_course";
const PARTNER_MODEL = "res.partner";
const TEE_MODEL = "x_tee_time_appointment";

const REL_FIELD = "x_golf_course_rates_id";
const COURSE_FIELD = "x_studio_golf_course";
const DESTINATION_FIELD = "x_studio_destination";

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

// --- OPTIONS ---
export async function OPTIONS() {
  return new Response(null, { status: 200, headers: CORS_HEADERS });
}

// --- GET (member lookup + rates) ---
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const memberEmail = (searchParams.get("member_email") || "").trim();

    // Member lookup
    if (memberEmail) {
      const partners = await callOdoo(
        PARTNER_MODEL,
        "search_read",
        [[["email", "ilike", memberEmail]]],
        {
          fields: [
            "id",
            "name",
            "email",
            "x_studio_free_buddy_passes",
            "x_studio_golf_ph_priveledge_card_no",
          ],
          limit: 1,
        }
      );
      return new Response(JSON.stringify({ member: partners?.[0] || null }), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // Rates fetch
    const includeAll = searchParams.get("all") === "1";
    const limit = Math.min(parseInt(searchParams.get("limit") || "500", 10), 1000);

    const parentDomain = includeAll ? [] : [["x_studio_show_to_dashboard", "=", true]];
    const parents = await callOdoo(
      PARENT_MODEL,
      "search_read",
      [parentDomain],
      { fields: ["id", "x_name"], limit }
    );

    if (!parents.length)
      return new Response(JSON.stringify({ lines: [] }), { status: 200, headers: CORS_HEADERS });

    const parentIds = parents.map(p => p.id);
    const lines = await callOdoo(
      LINE_MODEL,
      "search_read",
      [[[REL_FIELD, "in", parentIds]]],
      {
        fields: [
          "id",
          COURSE_FIELD,
          "x_studio_local_wd",
          "x_studio_local_we",
          "x_studio_foreign_wd",
          "x_studio_foreign_we",
          "x_studio_acr_wd",
          "x_studio_acr_we",
          "x_studio_caddy",
          "x_studio_golf_cart",
          "x_studio_insurance",
          "x_studio_consumables",
          "x_studio_prepayment",
          "x_studio_notes",
          "x_studio_promotion",
        ],
        limit,
      }
    );

    const courseIds = Array.from(new Set(
      lines
        .map(l => Array.isArray(l[COURSE_FIELD]) ? l[COURSE_FIELD][0] : null)
        .filter(Boolean)
    ));

    const courses = await callOdoo(
      COURSE_MODEL,
      "search_read",
      [[["id", "in", courseIds]]],
      { fields: ["id", "x_name", DESTINATION_FIELD] }
    );

    const courseMap = Object.fromEntries(courses.map(c => [c.id, c]));
    const enriched = lines.map(l => {
      const courseId = Array.isArray(l[COURSE_FIELD]) ? l[COURSE_FIELD][0] : null;
      const courseName = Array.isArray(l[COURSE_FIELD]) ? l[COURSE_FIELD][1] : "";
      const courseInfo = courseMap[courseId] || {};
      return {
        golf_course_name: courseName,
        destination: courseInfo[DESTINATION_FIELD] || "",
        local_wd: l.x_studio_local_wd,
        local_we: l.x_studio_local_we,
        foreign_wd: l.x_studio_foreign_wd,
        foreign_we: l.x_studio_foreign_we,
        acr_wd: l.x_studio_acr_wd,
        acr_we: l.x_studio_acr_we,
        caddy: l.x_studio_caddy,
        golf_cart: l.x_studio_golf_cart,
        insurance: l.x_studio_insurance,
        consumables: l.x_studio_consumables,
        prepayment: !!l.x_studio_prepayment,
        notes: l.x_studio_notes,
        promotion: l.x_studio_promotion,
      };
    });

    return new Response(JSON.stringify({ lines: enriched }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("GET error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: CORS_HEADERS,
    });
  }
}

// --- POST (Create Tee Time record) ---
export async function POST(request) {
  try {
    const body = await request.json();
    const {
      golf_course,
      date,
      time,
      email,
      players,
      used_buddy_pass,
    } = body;

    // Find member by email
    const partners = await callOdoo(
      PARTNER_MODEL,
      "search_read",
      [[["email", "=", email]]],
      { fields: ["id", "x_studio_free_buddy_passes"], limit: 1 }
    );
    const member = partners?.[0];
    if (!member) throw new Error("Member not found in Odoo.");

    const memberId = member.id;

    // Create tee time record
    const tee_id = await callOdoo(
      TEE_MODEL,
      "create",
      [[{
        x_studio_golf_course: golf_course,
        x_studio_member: memberId,
        x_studio_date: date,
        x_studio_time: time,
        x_studio_players: players.join(", "),
        x_studio_used_buddy_pass: used_buddy_pass,
      }]]
    );

    // Update remaining passes
    const remaining = (member.x_studio_free_buddy_passes || 0) - used_buddy_pass;
    await callOdoo(PARTNER_MODEL, "write", [[memberId], { x_studio_free_buddy_passes: Math.max(0, remaining) }]);

    return new Response(JSON.stringify({
      success: true,
      tee_id,
      remaining_passes: Math.max(0, remaining),
    }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("POST error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: CORS_HEADERS,
    });
  }
}
