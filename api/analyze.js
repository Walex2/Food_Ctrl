export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const API_KEY = process.env.GEMINI_API_KEY;
    if (!API_KEY) {
        return res.status(500).json({ error: 'Falta configurar GEMINI_API_KEY en Vercel' });
    }

    try {
        const { text, imageBase64, userWeight } = req.body;
        const weight = userWeight || 90;

        const systemPrompt = `Eres el motor nutricional de la app Food-ctrl. El usuario pesa ${weight}kg.
        Analiza la comida o el ejercicio descrito (o la imagen adjunta).
        - Si es caminata en KM, calcula (${weight} * 0.72) kcal quemadas por cada KM.
        - Si es comida, calcula las calorías y los gramos exactos de proteína, grasa y carbohidratos.
        - Calcula también los "punts" (Puntos Enlínia): frutas/verduras naturales = 0 puntos; para el resto estima 1 punto por cada ~40 kcal (penalizando un poco más grasas y azúcares).
        RESPONDE ÚNICAMENTE CON UN OBJETO JSON VÁLIDO SIN TEXTO ADICIONAL:
        {"type": "food" o "exercise", "name": "Nombre corto", "kcal": 0, "prot": 0, "fat": 0, "carb": 0, "punts": 0}`;

        const parts = [{ text: systemPrompt + "\nEntrada del usuario: " + (text || "Analiza esta imagen") }];

        if (imageBase64) {
            parts.push({
                inline_data: {
                    mime_type: "image/jpeg",
                    data: imageBase64
                }
            });
        }

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts }] })
            }
        );

        if (!response.ok) {
            const errText = await response.text();
            return res.status(response.status).json({ error: errText });
        }

        const data = await response.json();
        const raw = data.candidates[0].content.parts[0].text;
        const cleanJson = raw.substring(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
        const parsed = JSON.parse(cleanJson);

        return res.status(200).json(parsed);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Error procesando con IA' });
    }
}
