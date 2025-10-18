// /app/api/odoo/route.js
// PURPOSE:
// - Signup (free/paid): create partner (or update-by-email) — no BD Member ID required.
// - Dashboard collector: set x_studio_bd_member_id by EMAIL only IF it is currently empty. No overwrite.

// ------------ CORS ------------
const ORIGIN = "https://appsumo55348.directoryup.com";
const CORS = {
  "Access-Control-Allow-Origin": ORIGIN,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Credentials": "true",
};

// ------------ Odoo config ------------
const ODOO_URL = "https://golfph.odoo.com";
const DB = "golfph";
const UID = 2;
const API_KEY = "62f86f3db7ba96368763a9d85b443f58f6458e4b";

// ------------ helper ------------
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
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(req) {
  try {
    const body = await req.json();

    // Common incoming fields
    const bdMemberId     = (body?.bd_member_id || "").toString().trim(); // for collector
    const email          = (body?.email || "").trim();                   // used as identity key
    const name           = (body?.name || "").trim();
    const phone          = (body?.phone || "").trim();
    const address        = (body?.address || "").trim();
    const dateJoined     = (body?.date_today || "").trim();
    const dateExpiry     = (body?.date_next_year || "").trim();
    const subscriptionId = Number(body?.subscription_id ?? 0);

    // Build a partial update payload with only non-empty fields (we never blank fields)
    const profileVals = {};
    if (name)        profileVals.name = name;
    if (email)       profileVals.email = email;
    if (phone)       profileVals.phone = phone;
    if (address)     profileVals.street = address;
    if (dateJoined)  profileVals.x_studio_date_joined = dateJoined;
    if (dateExpiry)  profileVals.x_studio_date_expiry  = dateExpiry;
    if (subscriptionId > 0) profileVals.x_studio_subscription_plan = subscriptionId;

    // ---------- PATH 1: Dashboard collector → set BD Member ID (by EMAIL) ONLY if empty ----------
    // Heuristic: collector typically sends { email, bd_member_id } and nothing else.
    const isCollectorAttempt =
      !!bdMemberId &&
      email &&
      // if only bd id + email arrive, treat as collector; but we also let it run even if other fields exist
      true;

    if (isCollectorAttempt) {
      // Find by email first (per your requirement)
      const found = await callOdoo(
        "res.partner",
        "search_read",
        [[["email", "=", email]]],
        { fields: ["id", "x_studio_bd_member_id"], limit: 1 }
      );

      if (!Array.isArray(found) || !found.length) {
        return new Response(
          JSON.stringify({ success: false, error: "Partner not found by email. Try opening dashboard after signup." }),
          { status: 404, headers: { ...CORS, "Content-Type": "application/json" } }
        );
      }

      const partner = found[0];
      const currentBdid = (partner.x_studio_bd_member_id ?? "").toString().trim();

      if (currentBdid) {
        // Already set → do nothing
        return new Response(
          JSON.stringify({ success: true, already_set: true, partner_id: partner.id, bd_member_id: currentBdid }),
          { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
        );
      }

      // Set BD Member ID (and only that). We can also carry along non-empty profile vals if you want,
      // but to be conservative we only set the BD ID here.
      await callOdoo("res.partner", "write", [[partner.id], { x_studio_bd_member_id: bdMemberId }]]);

      return new Response(
        JSON.stringify({ success: true, bd_set: true, partner_id: partner.id, bd_member_id: bdMemberId }),
        { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    // ---------- PATH 2: Signup / profile create-or-update by EMAIL (NO BD-ID requirement) ----------
    // Must have at least something meaningful
    if (!email && !name && !phone) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing basic data (email/name/phone)." }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    // Lookup by email
    const existing = email
      ? await callOdoo(
          "res.partner",
          "search_read",
          [[["email", "=", email]]],
          { fields: ["id"], limit: 1 }
        )
      : [];

    if (Array.isArray(existing) && existing.length) {
      const partnerId = existing[0].id;

      if (Object.keys(profileVals).length) {
        await callOdoo("res.partner", "write", [[partnerId], profileVals]);
      }

      // We do NOT set x_studio_bd_member_id on this path.
      return new Response(
        JSON.stringify({ success: true, updated: true, partner_id: partnerId }),
        { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    // Not found → create
    if (!email) {
      return new Response(
        JSON.stringify({ success: false, error: "Email is required to create a member." }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    // Ensure name presence for Odoo
    const createVals = {
      name: profileVals.name || "No name provided",
      email: email,
      phone: profileVals.phone || undefined,
      street: profileVals.street || undefined,
      x_studio_date_joined: profileVals.x_studio_date_joined || undefined,
      x_studio_date_expiry: profileVals.x_studio_date_expiry || undefined,
      x_studio_subscription_plan: profileVals.x_studio_subscription_plan || undefined,
    };

    const newId = await callOdoo("res.partner", "create", [createVals]);

    return new Response(
      JSON.stringify({ success: true, created: true, partner_id: newId }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("❌ Odoo route error:", err);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
}
