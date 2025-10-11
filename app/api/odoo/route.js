export async function POST(req) {
  try {
    const body = await req.json();

    const ODOO_URL = "https://puddle-paper.odoo.com";
    const DB = "puddle-paper";
    const USER = "2";
    const API_KEY = "a6b8180478f3e13af0c42ed6087350df7bbbb7aa";

    // --- Helper: JSON-RPC call to Odoo ---
    async function callOdoo(method, model, args = []) {
      const res = await fetch(`${ODOO_URL}/jsonrpc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "call",
          params: {
            service: "object",
            method: "execute_kw",
            args: [DB, USER, API_KEY, model, method, args],
          },
          id: Date.now(),
        }),
      });
      return await res.json();
    }

    // --- Step 1: Check if contact with same email exists ---
    const email = (body.email || "").trim().toLowerCase();
    const existing = await callOdoo("search_read", "res.partner", [[["email", "ilike", email]]]);

    if (existing?.result?.length) {
      console.log("🟡 Existing contact found — updating instead of creating");
      const existingId = existing.result[0].id;

      // Update existing record instead of creating duplicate
      const updateRes = await callOdoo("write", "res.partner", [[existingId], {
        name: body.name || existing.result[0].name,
        phone: body.phone || existing.result[0].phone,
        street: body.address || existing.result[0].street,
        x_studio_date_joined: body.date_today || existing.result[0].x_studio_date_joined,
        x_studio_date_expiry: body.date_next_year || existing.result[0].x_studio_date_expiry,
        x_studio_subscription_plan: body.subscription_id || existing.result[0].x_studio_subscription_plan,
      }]);

      return new Response(JSON.stringify({ updated_id: existingId, result: updateRes }), { status: 200 });
    }

    // --- Step 2: Create new if none found ---
    const createRes = await callOdoo("create", "res.partner", [[{
      name: body.name || "No name provided",
      email: body.email || "",
      phone: body.phone || "",
      street: body.address || "",
      x_studio_date_joined: body.date_today || "",
      x_studio_date_expiry: body.date_next_year || "",
      x_studio_subscription_plan: body.subscription_id || 2,
    }]]);

    return new Response(JSON.stringify(createRes), { status: 200 });
  } catch (error) {
    console.error("❌ Error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
