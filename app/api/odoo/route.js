export async function POST(req) {
  try {
    const body = await req.json();

    // Example: Send data from Brilliant Directory form to Odoo
    const response = await fetch('https://puddle-paper.odoo.com//jsonrpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'call',
        params: {
          service: 'object',
          method: 'execute_kw',
          args: [
            'puddle-paper',
            2, // user ID
            'c4fe251e46429be275daffb7147bda157d19aff5',
            'x_golf_course', // example model
            'create',      // example method
            [{ name: body.name, email: body.email }],
          ],
        },
        id: new Date().getTime(),
      }),
    });

    const result = await response.json();
    return new Response(JSON.stringify(result), { status: 200 });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
