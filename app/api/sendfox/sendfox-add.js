export default async function handler(req, res) {
  try {
    const { email, first_name, last_name, list_id } = req.body;

    if (!email || !list_id) {
      return res.status(400).json({
        error: "email and list_id are required"
      });
    }

    const response = await fetch("https://api.sendfox.com/contacts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.SENDFOX_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email,
        first_name,
        last_name,
        lists: [Number(list_id)]
      })
    });

    const data = await response.json();

    res.status(200).json({
      success: true,
      sendfox_response: data
    });

  } catch (error) {
    res.status(500).json({
      error: "Failed to add contact to SendFox",
      details: error.message
    });
  }
}
