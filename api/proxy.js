export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const response = await fetch('/api/proxy', {
    method: 'POST',
    body: JSON.stringify(req.body)
  });
  const data = await response.json();
  res.status(200).json(data);
}
