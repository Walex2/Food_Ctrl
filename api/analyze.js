// Límit de la foto en base64 (Vercel talla les peticions a 4,5 MB)
const MAX_IMAGE_CHARS = 3_000_000;

const RESPONSE_SCHEMA = {
    type: 'OBJECT',
    properties: {
        type: { type: 'STRING', enum: ['food', 'exercise'] },
        name: { type: 'STRING' },
        grams: { type: 'NUMBER' },
        kcal: { type: 'NUMBER' },
        prot: { type: 'NUMBER' },
        fat: { type: 'NUMBER' },
        carb: { type: 'NUMBER' },
        punts: { type: 'NUMBER' }
    },
    required: ['type', 'name', 'grams', 'kcal', 'prot', 'fat', 'carb', 'punts']
};

function toNum(v, max) {
    const n = Math.round(Number(v));
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.min(n, max);
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const API_KEY = process.env.GEMINI_API_KEY;
    if (!API_KEY) {
        return res.status(500).json({ error: 'Falta configurar GEMINI_API_KEY a Vercel' });
    }

    // Codi d'accés: si APP_CODE està configurat, només hi entra qui el sap
    const APP_CODE = process.env.APP_CODE;
    if (APP_CODE && req.headers['x-app-code'] !== APP_CODE) {
        return res.status(401).json({ error: "Codi d'accés incorrecte" });
    }

    try {
        const { text, imageBase64, imageMime, userWeight } = req.body || {};
        const weight = Number(userWeight) > 0 ? Number(userWeight) : 90;

        if (!text && !imageBase64) {
            return res.status(400).json({ error: 'Cal un text o una foto' });
        }
        if (imageBase64 && imageBase64.length > MAX_IMAGE_CHARS) {
            return res.status(413).json({ error: 'La foto és massa gran' });
        }

        const systemPrompt = `Eres el motor nutricional de la app Food-ctrl. El usuario pesa ${weight}kg.
        Analiza la comida o el ejercicio descrito (o la imagen adjunta).
        - Si es caminata en KM, calcula (${weight} * 0.72) kcal quemadas por cada KM.
        - Si es ejercicio, pon grams, prot, fat, carb y punts a 0.
        - Si es comida, "grams" es el peso total estimado de la ración en gramos (ml si es bebida); todos los valores corresponden a esa cantidad.
        - Si es comida, calcula las calorías y los gramos exactos de proteína, grasa y carbohidratos.
        - Calcula también los "punts" (Puntos Enlínia): frutas/verduras naturales = 0 puntos; para el resto estima 1 punto por cada ~40 kcal (penalizando un poco más grasas y azúcares).
        - El campo "name" debe ser un nombre corto en catalán.`;

        const parts = [{ text: systemPrompt + "\nEntrada del usuario: " + (text || "Analiza esta imagen") }];

        if (imageBase64) {
            parts.push({
                inline_data: {
                    mime_type: imageMime || 'image/jpeg',
                    data: imageBase64
                }
            });
        }

        const response = await fetch(
            'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-goog-api-key': API_KEY },
                body: JSON.stringify({
                    contents: [{ parts }],
                    generationConfig: {
                        temperature: 0,
                        responseMimeType: 'application/json',
                        responseSchema: RESPONSE_SCHEMA
                    }
                })
            }
        );

        if (!response.ok) {
            console.error('Gemini', response.status, await response.text());
            return res.status(502).json({ error: `Gemini ha retornat un error (${response.status})` });
        }

        const data = await response.json();
        const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!raw) {
            return res.status(502).json({ error: "La IA no ha pogut analitzar l'entrada" });
        }

        const parsed = JSON.parse(raw);
        const isEx = parsed.type === 'exercise';

        return res.status(200).json({
            type: isEx ? 'exercise' : 'food',
            name: String(parsed.name || 'Sense nom').slice(0, 80),
            grams: isEx ? 0 : toNum(parsed.grams, 5000),
            kcal: toNum(parsed.kcal, 5000),
            prot: isEx ? 0 : toNum(parsed.prot, 500),
            fat: isEx ? 0 : toNum(parsed.fat, 500),
            carb: isEx ? 0 : toNum(parsed.carb, 1000),
            punts: isEx ? 0 : toNum(parsed.punts, 200)
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Error processant amb IA' });
    }
}
