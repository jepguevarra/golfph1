// /app/api/odoo/route.js
// Upsert partner preferring BDID for updates; create by email if no match exists.

const ORIGIN = "https://appsumo55348.directoryup.com";

const CORS = {
  "Access-Control-Allow-Origin": ORIGIN,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Credentials": "true",
};

const ODOO_URL = "https://golfph.odoo.com";
const DB = "golfph";
const UID = 2;
const API_KEY = "62f86f3db7ba96368763a9d85b443f58f6458e4b";

// ---------- helper ----------
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

    // If explicitly asked to set BDID (from dashboard collector), do that flow.
    if (body?.set_bd_member_id) {
      return await setBdidOnce(body);
    }

    // Default: upsert partner, **BDID-first**.
    return await upsertPartner(body);

  } catch (err) {
    console.error("❌ Odoo route error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
}

// ---------- 1) Dashboard collector: set BD ID once (by EMAIL) ----------
async function setBdidOnce(payload) {
  const email = (payload?.email || "").trim();
  const bdMemberId = (payload?.bd_member_id || "").trim();

  if (!email || !bdMemberId) {
    return new Response(
      JSON.stringify({ success: false, message: "email and bd_member_id are required" }),
      { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }

  // find partner by email
  const partners = await callOdoo(
    "res.partner",
    "search_read",
    [[["email", "=", email]]],
    { fields: ["id", "x_studio_bd_member_id"], limit: 1 }
  );

  if (!partners.length) {
    return new Response(
      JSON.stringify({ success: false, message: "No partner found for email", email }),
      { status: 404, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }

  const partner = partners[0];
  if (partner.x_studio_bd_member_id) {
    return new Response(
      JSON.stringify({ success: true, already_set: true, partner_id: partner.id, bd_member_id: partner.x_studio_bd_member_id }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }

  await callOdoo("res.partner", "write", [[partner.id], { x_studio_bd_member_id: bdMemberId }]);

  return new Response(
    JSON.stringify({ success: true, bd_set: true, partner_id: partner.id, bd_member_id: bdMemberId }),
    { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
  );
}

// ---------- 2) Upsert partner (BDID-first; create by email if no match) ----------
async function upsertPartner(payload) {
  const name           = (payload?.name || "").trim();
  const email          = (payload?.email || "").trim();
  const phone          = (payload?.phone || "").trim();
  const address        = (payload?.address || "").trim(); // concatenated widget address
  const dateJoined     = (payload?.date_today || "").trim();
  const dateExpiry     = (payload?.date_next_year || "").trim();
  const subscriptionId = Number(payload?.subscription_id ?? 0);
  const bdMemberId     = (payload?.bd_member_id || "").trim(); // may be empty on first signup

  const BDID_FIELD = "x_studio_bd_member_id";

  // build values to write (omit empties)
  const vals = {};
  if (name)       vals.name = name;
  if (email)      vals.email = email;     // allow email change during update
  if (phone)      vals.phone = phone;
  if (address)    vals.street = address;
  if (dateJoined) vals.x_studio_date_joined = dateJoined;
  if (dateExpiry) vals.x_studio_date_expiry  = dateExpiry;
  if (subscriptionId > 0) vals.x_studio_subscription_plan = subscriptionId;

  // ---------- A) Try BDID match first ----------
  let partnerId = null;
  if (bdMemberId) {
    const byBdid = await callOdoo(
      "res.partner",
      "search_read",
      [[ [BDID_FIELD, "=", bdMemberId] ]],
      { fields: ["id"], limit: 1 }
    );
    if (byBdid?.length) partnerId = byBdid[0].id;
  }

  // ---------- B) If no BDID match, try EMAIL then PHONE ----------
  if (!partnerId && email) {
    const byEmail = await callOdoo(
      "res.partner",
      "search_read",
      [[ ["email", "=", email] ]],
      { fields: ["id", BDID_FIELD], limit: 1 }
    );
    if (byEmail?.length) partnerId = byEmail[0].id;
  }

  if (!partnerId && phone) {
    const byPhone = await callOdoo(
      "res.partner",
      "search_read",
      [[ ["phone", "=", phone] ]],
      { fields: ["id", BDID_FIELD], limit: 1 }
    );
    if (byPhone?.length) partnerId = byPhone[0].id;
  }

  // ---------- C) Update if found ----------
  if (partnerId) {
    // IMPORTANT: do not overwrite BDID here unless you explicitly want to.
    await callOdoo("res.partner", "write", [[partnerId], vals]);
    return new Response(
      JSON.stringify({ success: true, updated: true, partner_id: partnerId, fields: vals, basis: bdMemberId ? "bdid" : (email ? "email" : "phone") }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }

  // ---------- D) Create if not found ----------
  // We require email for creation (so Odoo has a unique contact point)
  if (!email) {
    return new Response(
      JSON.stringify({ success: false, message: "No existing partner matched; 'email' is required to create a new contact." }),
      { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }

  const createVals = { email, ...vals };
  if (bdMemberId) createVals[BDID_FIELD] = bdMemberId; // attach BDID at creation if available

  const newId = await callOdoo("res.partner", "create", [createVals]);

  return new Response(
    JSON.stringify({ success: true, created: true, partner_id: newId, fields: createVals }),
    { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
  );
}
