// /app/api/odoo/route.js
// Upsert partner on signup by EMAIL; set BD ID later via collector (email->BDID) exactly once.

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

    // Router:
    // If the request explicitly asks to set the BD ID (from dashboard collector) -> do that.
    // Otherwise treat it as signup/profile upsert by email.
    if (body?.set_bd_member_id) {
      return await setBdidOnce(body);
    }
    return await upsertByEmail(body);

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

  // ✅ FIXED: removed the extra closing bracket here
  await callOdoo("res.partner", "write", [[partner.id], { x_studio_bd_member_id: bdMemberId }]);

  return new Response(
    JSON.stringify({ success: true, bd_set: true, partner_id: partner.id, bd_member_id: bdMemberId }),
    { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
  );
}

// ---------- 2) Signup / profile upsert by EMAIL (create if missing) ----------
async function upsertByEmail(payload) {
  const name          = (payload?.name || "").trim();
  const email         = (payload?.email || "").trim();
  const phone         = (payload?.phone || "").trim();
  const address       = (payload?.address || "").trim();
  const dateJoined    = (payload?.date_today || "").trim();
  const dateExpiry    = (payload?.date_next_year || "").trim();
  const subscriptionId= Number(payload?.subscription_id ?? 0);
  const bdMemberId    = (payload?.bd_member_id || "").trim(); // may or may not be present on signup

  if (!email) {
    return new Response(
      JSON.stringify({ success: false, message: "email is required" }),
      { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }

  const baseVals = {};
  if (name)       baseVals.name = name;
  if (phone)      baseVals.phone = phone;
  if (address)    baseVals.street = address;
  if (dateJoined) baseVals.x_studio_date_joined = dateJoined;
  if (dateExpiry) baseVals.x_studio_date_expiry  = dateExpiry;
  if (subscriptionId > 0) baseVals.x_studio_subscription_plan = subscriptionId;

  // Look up by email
  const partners = await callOdoo(
    "res.partner",
    "search_read",
    [[["email", "=", email]]],
    { fields: ["id", "x_studio_bd_member_id"], limit: 1 }
  );

  if (partners.length) {
    const id = partners[0].id;
    // Do not overwrite BD ID here; collector handles that one-time set
    await callOdoo("res.partner", "write", [[id], baseVals]);
    return new Response(
      JSON.stringify({ success: true, updated: true, partner_id: id, fields: baseVals }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }

  // Create new partner
  const createVals = {
    email,
    ...baseVals,
  };
  // If BD ID is already known at creation time, include it (harmless on first create)
  if (bdMemberId) createVals.x_studio_bd_member_id = bdMemberId;

  const newId = await callOdoo("res.partner", "create", [createVals]);

  return new Response(
    JSON.stringify({ success: true, created: true, partner_id: newId, fields: createVals }),
    { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
  );
}
