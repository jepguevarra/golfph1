export default async function handler(req, res) {
  try {
    const response = await fetch("https://api.sendfox.com/lists", {
      headers: {
        Authorization: `Bearer ${process.env.SENDFOX_API_KEY}`
      }
    });

    const data = await response.json();

    // Normalize response for Odoo
    const lists = data.data.map(list => ({
      id: list.id,
      name: list.name
    }));

    res.status(200).json(lists);
  } catch (error) {
    res.status(500).json({
      error: "Failed to fetch SendFox lists",
      details: error.message
    });
  }
}
