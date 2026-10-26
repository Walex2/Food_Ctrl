import { get, put } from '@vercel/blob';

// Historial de pes en un sol fitxer privat de Vercel Blob: { "2026-10-25": 89.4, ... }
const PATHNAME = 'weights.json';

function todayMadrid() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
}

async function readWeights() {
    const result = await get(PATHNAME, { access: 'private', useCache: false });
    if (!result || result.statusCode !== 200) return {};
    return JSON.parse(await new Response(result.stream).text());
}

// Accepta 89.4, "89.4" o "89,4"; descarta valors que no poden ser un pes
function parseKg(v) {
    const n = Math.round(parseFloat(String(v ?? '').replace(',', '.')) * 10) / 10;
    return n >= 20 && n <= 400 ? n : null;
}

function parseDate(v) {
    const s = String(v || '').trim().slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

export default async function handler(req, res) {
    const APP_CODE = process.env.APP_CODE;
    if (APP_CODE && req.headers['x-app-code'] !== APP_CODE) {
        return res.status(401).json({ error: "Codi d'accés incorrecte" });
    }

    try {
        if (req.method === 'GET') {
            return res.status(200).json({ weights: await readWeights() });
        }

        if (req.method === 'POST') {
            const body = req.body || {};
            const kg = parseKg(body.kg);
            if (kg === null) {
                return res.status(400).json({ error: 'Pes no vàlid' });
            }
            const date = parseDate(body.date) || todayMadrid();

            const weights = await readWeights();
            weights[date] = kg;
            await put(PATHNAME, JSON.stringify(weights), {
                access: 'private',
                allowOverwrite: true,
                addRandomSuffix: false,
                contentType: 'application/json'
            });
            return res.status(200).json({ ok: true, date, kg });
        }

        if (req.method === 'DELETE') {
            const date = parseDate(req.query?.date);
            if (!date) return res.status(400).json({ error: 'Falta la data' });
            const weights = await readWeights();
            delete weights[date];
            await put(PATHNAME, JSON.stringify(weights), {
                access: 'private',
                allowOverwrite: true,
                addRandomSuffix: false,
                contentType: 'application/json'
            });
            return res.status(200).json({ ok: true });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "No s'ha pogut accedir a l'historial de pes" });
    }
}
