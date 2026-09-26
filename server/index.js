const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const { GoogleGenAI } = require('@google/genai');

const app = express();
app.use(cors());
app.use(express.json());

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL_NAME = 'gemini-3.8-flash'; // one place to change this everywhere

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// --- Geocoding: try the full address, fall back to name + city if it fails ---
async function tryGeocode(query) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
  const res = await fetch(url, { headers: { 'User-Agent': 'TripPilot-ResumeProject/1.0' } });
  const data = await res.json();
  await delay(1100); // Nominatim free tier: max 1 request/sec
  if (!data.length) return null;
  return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
}

async function geocodeAddress(address, name, city) {
  let coord = await tryGeocode(address);
  if (coord) return coord;

  if (name) {
    coord = await tryGeocode(`${name}, ${city || ''}`);
    if (coord) return coord;
  }
  return null;
}

// --- Real travel time/distance between two coordinates ---
async function getTravelInfo(from, to) {
  const url = `https://api.openrouteservice.org/v2/directions/driving-car?api_key=${process.env.ORS_API_KEY}&start=${from.lon},${from.lat}&end=${to.lon},${to.lat}`;
  const res = await fetch(url);
  const data = await res.json();
  const summary = data.features[0].properties.summary;
  return {
    distanceKm: +(summary.distance / 1000).toFixed(1),
    durationMinutes: Math.round(summary.duration / 60)
  };
}

// --- Gemini call with retry on transient overload ---
async function generateWithRetry(config, contents, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await ai.models.generateContent({ model: MODEL_NAME, contents, config });
    } catch (err) {
      const isOverloaded = err.message?.includes('overloaded') || err.message?.includes('UNAVAILABLE') || err.message?.includes('high demand');
      if (isOverloaded && i < retries - 1) {
        await delay(2000 * (i + 1)); // 2s, then 4s, then 6s
        continue;
      }
      throw err;
    }
  }
}

// --- Health check ---
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'TripPilot backend is alive' });
});

// --- Gemini connectivity test ---
app.get('/api/test-gemini', async (req, res) => {
  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: 'Say hello and confirm you are working, in one sentence.',
    });
    res.json({ reply: response.text });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// --- Itinerary generation ---
const itinerarySchema = {
  type: 'object',
  properties: {
    destination: { type: 'string' },
    weatherSummary: { type: 'string', description: 'Brief forecast for the trip dates' },
    days: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          date: { type: 'string' },
          stops: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                category: { type: 'string' },
                address: { type: 'string', description: 'Real, searchable address or area name' },
                suggestedStartTime: { type: 'string', description: 'e.g. 09:00' },
                durationMinutes: { type: 'number' },
                estimatedCost: { type: 'number', description: 'In INR' },
                reason: { type: 'string', description: 'Why this fits their interests' }
              },
              required: ['name', 'address', 'suggestedStartTime', 'durationMinutes', 'estimatedCost']
            }
          }
        },
        required: ['date', 'stops']
      }
    }
  },
  required: ['destination', 'weatherSummary', 'days']
};

app.post('/api/generate-itinerary', async (req, res) => {
  const { destination, startDate, endDate, budget, interests, hotel } = req.body;

  const prompt = `You are a travel planner. Create a realistic day-by-day itinerary for a trip to ${destination} from ${startDate} to ${endDate}.
Traveler's hotel/base location: ${hotel}.
Total budget: ₹${budget} for the whole trip.
Interests: ${interests.join(', ')}.

Use real, currently operating places — real names and real addresses, not invented ones. Group stops sensibly by day so nearby places are visited on the same day. Include estimated costs in INR that sum to roughly the given budget. Also give a brief weather forecast summary for the trip dates.`;

  const useGrounding = process.env.USE_GROUNDING === 'true';

  const config = {
    responseMimeType: 'application/json',
    responseSchema: itinerarySchema,
    ...(useGrounding ? { tools: [{ googleSearch: {} }] } : {})
  };

  try {
    const response = await generateWithRetry(config, prompt);
    const itinerary = JSON.parse(response.text);

    for (const day of itinerary.days) {
      let prevCoord = null;
      for (const stop of day.stops) {
        const coord = await geocodeAddress(stop.address, stop.name, itinerary.destination);

        if (coord) {
          stop.lat = coord.lat;
          stop.lon = coord.lon;
          if (prevCoord) {
            try {
              stop.travelFromPrevious = await getTravelInfo(prevCoord, coord);
            } catch (e) {
              stop.travelFromPrevious = null;
            }
          }
          prevCoord = coord;
        } else {
          stop.lat = null;
          stop.lon = null;
        }
      }
    }

    res.json(itinerary);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));