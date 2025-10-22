// /app/api/teetimes/route.js

const ALLOWED_ORIGIN = "https://members.golfph.com";
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

const ODOO_URL = "https://golfph.odoo.com";
const DB = "golfph";
const UID = 2;
const API_KEY = "62f86f3db7ba96368763a9d85b443f58f6458e4b";

const MODEL_PARTNER = "res.partner";
const MODEL_TEE = "x_tee_time_appointment";
const MODEL_GOLF_COURSE = "x_golf_course";

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
  if (json.error) throw new Error(json.error.data?.message || json.error.message);
  return json.result;
}

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: CORS_HEADERS });
}

/**
 * GET /api/teetimes?member_email=<email>&limit=20&page=1&q=<search>
 *
 * Returns:
 * {
 *   items: [
 *     {
 *       id, reference, date, time, status,
 *       golf_course_id, golf_course_name,
 *       buddy_pass_deduction, sequence
 *     }, ...
 *   ],
 *   total, page, limit
 * }
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const memberEmail = (searchParams.get("member_email") || "").trim();
    const limit = Math.max(1, Math.min(parseInt(searchParams.get("limit") || "20", 10), 100));
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const offset = (page - 1) * limit;
    const q = (searchParams.get("q") || "").trim().toLowerCase();

    if (!memberEmail) {
      throw new Error("member_email is required.");
    }

    // 1) Find partner by email
    const partner = await callOdoo(
      MODEL_PARTNER,
      "search_read",
      [[["email", "=", memberEmail]]],
      { fields: ["id"], limit: 1 }
    );
    const partnerId = partner?.[0]?.id;
    if (!partnerId) {
      // No account found → empty result (not an error to the UI)
      return new Response(JSON.stringify({
        items: [],
        total: 0,
        page,
        limit
      }), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // 2) Optional search: if q provided, we’ll search by reference and course name.
    //    Because x_studio_golf_course is a many2one, searching by the course's display name
    //    requires an in-operator on the relation after we find courses matching q.
    let courseIdsForQ = [];
    if (q) {
      const courses = await callOdoo(
        MODEL_GOLF_COURSE,
        "search_read",
        [[["x_name", "ilike", q]]],
        { fields: ["id"], limit: 200 }
      );
      courseIdsForQ = (courses || []).map(c => c.id);
    }

    // Build domain
    // Base: bookings of this member
    const baseDomain = [["x_studio_member", "=", partnerId]];

    // If q exists, include OR on reference ilike OR course in found ids
    const domain = q
      ? ["&", ...baseDomain, "|",
          ["x_name", "ilike", q],
          ["x_studio_golf_course", "in", courseIdsForQ.length ? courseIdsForQ : [-1]]
        ]
      : baseDomain;

    // 3) Count total (for pagination UI)
    const total = await callOdoo(MODEL_TEE, "search_count", [domain]);

    // 4) Fetch page
    const fields = [
      "x_name",                                         // Reference
      "x_studio_date",                                  // Date
      "x_studio_time",                                  // Time
      "x_studio_selection_field_8jm_1j7dq7a1s",         // Pipeline status bar (status)
      "x_studio_golf_course",                           // Many2one: [id, name]
      "x_studio_buddy_pass_deduction",                  // Buddy Pass Deduction
      "x_studio_sequence"                               // Sequence
    ];

    const rows = await callOdoo(
      MODEL_TEE,
      "search_read",
      [domain],
      {
        fields,
        limit,
        offset,
        // Order by date desc, then time desc, then sequence desc (tweak as needed)
        order: "x_studio_date desc, x_studio_time desc, x_studio_sequence desc",
      }
    );

    // 5) Map records to UI-friendly shape
    const items = (rows || []).map(r => {
      const gc = Array.isArray(r.x_studio_golf_course) ? r.x_studio_golf_course : [null, ""];
      return {
        id: r.id,
        reference: r.x_name || "",
        date: r.x_studio_date || "",
        time: r.x_studio_time || "",
        status: r["x_studio_selection_field_8jm_1j7dq7a1s"] || "",
        golf_course_id: gc[0],
        golf_course_name: gc[1] || "",
        buddy_pass_deduction: r.x_studio_buddy_pass_deduction ?? null,
        sequence: r.x_studio_sequence ?? null,
      };
    });

    return new Response(JSON.stringify({
      items,
      total,
      page,
      limit
    }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: CORS_HEADERS,
    });
  }
}
