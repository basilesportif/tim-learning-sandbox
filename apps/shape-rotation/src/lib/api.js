const BASE = import.meta.env.DEV ? 'http://localhost:3004' : '';
const APP_NAME = import.meta.env.BASE_URL.replace(/\//g, '');

export async function getData(file) {
  const res = await fetch(`${BASE}/${APP_NAME}/api/data/${file}`);
  return res.json();
}

export async function saveData(file, data) {
  const res = await fetch(`${BASE}/${APP_NAME}/api/data/${file}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}
