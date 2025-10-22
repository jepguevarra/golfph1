// /app/api/golfrates/route.js

const ALLOWED_ORIGIN = "https://members.golfph.com";
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

const ODOO_URL = "https://golfph.odoo.com";
const DB = "golfph";
const UID = 2;
const API_KEY = "62f86f3db7ba96368763a9d85b443f58f6458e4b";

const MODEL_GOLF_RATES = "x_golf_course_rates_line_931dd";
const MODEL_GOLF_COURSE = "x_golf_course";
const MODEL_PARTNER = "res.partner";
const MODEL_TEE = "x_tee_time_appointment";

// ---------- helpers ----------
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

function normalizeStatus(status) {
  const s = String(status || "").trim().toLowerCase();
  if (["expired", "expire", "exp"].includes(s)) return "expired";
  if (["new", "pending", "awaiting activation"].includes(s)) return "new";
  if (["cancelled", "canceled", "inactive"].includes(s)) return "cancelled";
  if (!s) return "";
  return s;
}
function statusBlockInfo(statusRaw) {
  const s = normalizeStatus(statusRaw);
  if (s === "expired" || s === "cancelled") {
    return { blocked: true, message: "Your membership is not active. Please renew your membership.", status: s };
  }
  if (s === "new") {
    return { blocked: true, message: "Your membership is pending. Please wait for account activation.", status: s };
  }
  return { blocked: false, message: "", status: s || "active" };
}

// ---------- routes ----------
export async function OPTIONS() {
  return new Response(null, { status: 200, headers: CORS_HEADERS });
}

// GET: member lookup (by BD member id OR email) OR golf rates list
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const memberBdid = searchParams.get("member_bdid");
    const memberEmail = searchParams.get("member_email");

    // Member lookup
    if (memberBdid || memberEmail) {
      const domain = memberBdid
        ? [["x_studio_bd_member_id", "=", String(memberBdid)]]
        : [["email", "=", String(memberEmail)]];

      const partner = await callOdoo(
        MODEL_PARTNER,
        "search_read",
        [domain],
        {
          fields: [
            "id",
            "name",
            "x_studio_free_buddy_passes",
            "x_studio_date_expiry",
            "x_studio_selection_field_33m_1j7j68j38",          // membership status
            "x_studio_golf_ph_priveledge_card_no"              // <-- privilege card number (added back)
          ],
          limit: 1,
        }
      );

      const rec = partner?.[0] || null;

      let payload = { member: null };
      if (rec) {
        const sb = statusBlockInfo(rec.x_studio_selection_field_33m_1j7j68j38);
        payload.member = {
          id: rec.id,
          name: rec.name,
          x_studio_free_buddy_passes: rec.x_studio_free_buddy_passes ?? 0,
          x_studio_date_expiry: rec.x_studio_date_expiry || null,
          status: sb.status,
          status_blocked: sb.blocked,
          status_message: sb.message,
          card_no: rec.x_studio_golf_ph_priveledge_card_no || "" // <-- expose to client
        };
      }

      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // Rates list
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

// POST: create tee time (BY BD MEMBER ID ONLY; blocks when status is not active)
export async function POST(request) {
  try {
    const body = await request.json();
    const { golf_course_id, bd_member_id, date, time, players } = body;

    if (!golf_course_id || !bd_member_id || !date || !time || !Array.isArray(players) || !players.length) {
      throw new Error("Missing required fields.");
    }

    const partner = (await callOdoo(
      MODEL_PARTNER,
      "search_read",
      [[["x_studio_bd_member_id", "=", String(bd_member_id)]]],
      {
        fields: [
          "id",
          "x_studio_selection_field_33m_1j7j68j38", // status
          "x_studio_free_buddy_passes",
        ],
        limit: 1,
      }
    ))?.[0];

    if (!partner) {
      return new Response(JSON.stringify({ error: "Member not found." }), {
        status: 404,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const block = statusBlockInfo(partner.x_studio_selection_field_33m_1j7j68j38);
    if (block.blocked) {
      return new Response(JSON.stringify({
        blocked: true,
        error: block.message,
        status: block.status
      }), {
        status: 403,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

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
