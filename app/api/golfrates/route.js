// /app/api/golfrates/route.js

const ALLOWED_ORIGIN = "https://appsumo55348.directoryup.com";
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

const ODOO_URL = "https://puddle-paper.odoo.com";
const DB = "puddle-paper";
const UID = 2;
const API_KEY = "a6b8180478f3e13af0c42ed6087350df7bbbb7aa";

const MODEL_GOLF_RATES = "x_golf_course_rates_line_931dd";
const MODEL_GOLF_COURSE = "x_golf_course";
const MODEL_PARTNER = "res.partner";
const MODEL_TEE = "x_tee_time_appointment";

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

// GET: member lookup (by email) or golf rates list
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const memberEmail = searchParams.get("member_email");

    if (memberEmail) {
      const partner = await callOdoo(
        MODEL_PARTNER,
        "search_read",
        [[["email", "=", memberEmail]]],
        {
          fields: [
            "id",
            "name",
            "x_studio_free_buddy_passes",
            "x_studio_golf_ph_priveledge_card_no",
            "x_studio_date_expiry", // <- NEW
          ],
          limit: 1,
        }
      );
      return new Response(JSON.stringify({ member: partner[0] || null }), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const rates = await callOdoo(
      MODEL_GOLF_RATES,
      "search_read",
      [[]],
      {
        fields: [
          "id",
          "x_studio_golf_course",
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
        limit: 1000,
      }
    );

    const courseIds = [...new Set(rates.map(r => r.x_studio_golf_course?.[0]).filter(Boolean))];
    const courses = courseIds.length
      ? await callOdoo(
          MODEL_GOLF_COURSE,
          "search_read",
          [[["id", "in", courseIds]]],
          { fields: ["id", "x_name", "x_studio_destination"] }
        )
      : [];

    const courseMap = Object.fromEntries(courses.map(c => [c.id, c]));

    const lines = rates.map(r => {
      const cid = r.x_studio_golf_course?.[0];
      const cname = r.x_studio_golf_course?.[1];
      const course = cid ? courseMap[cid] : null;
      return {
        id: r.id,
        golf_course_id: cid,
        golf_course_name: cname,
        destination: course?.x_studio_destination || "",
        local_wd: r.x_studio_local_wd,
        local_we: r.x_studio_local_we,
        foreign_wd: r.x_studio_foreign_wd,
        foreign_we: r.x_studio_foreign_we,
        acr_wd: r.x_studio_acr_wd,
        acr_we: r.x_studio_acr_we,
        caddy: r.x_studio_caddy,
        golf_cart: r.x_studio_golf_cart,
        insurance: r.x_studio_insurance,
        consumables: r.x_studio_consumables,
        prepayment: !!r.x_studio_prepayment,
        notes: r.x_studio_notes,
        promotion: r.x_studio_promotion,
      };
    });

    return new Response(JSON.stringify({ lines }), {
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

// POST: create tee time (NO buddy pass deduction here)
export async function POST(request) {
  try {
    const body = await request.json();
    const { golf_course_id, email, date, time, players } = body;

    if (!golf_course_id || !email || !date || !time || !Array.isArray(players) || !players.length) {
      throw new Error("Missing required fields.");
    }

    const partner = (await callOdoo(
      MODEL_PARTNER,
      "search_read",
      [[["email", "=", email]]],
      { fields: ["id", "x_studio_free_buddy_passes"], limit: 1 }
    ))?.[0];
    if (!partner) throw new Error("Member not found.");

    // Used passes (preview-only, do not write in POST)
    const usedBuddyPass = Math.max(0, players.length - 1);

    const teeId = await callOdoo(
      MODEL_TEE,
      "create",
      [[{
        x_studio_golf_course: golf_course_id,
        x_studio_member: partner.id,
        x_studio_date: date,
        x_studio_time: time,
        x_studio_players: players.join(", "),
        x_studio_used_buddy_pass: usedBuddyPass,
      }]]
    );

    return new Response(JSON.stringify({
      success: true,
      tee_id: teeId,
      preview_used_buddy_pass: usedBuddyPass
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
