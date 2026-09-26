import { useState } from 'react';
import axios from 'axios';
import './App.css';
 
function App() {
  const [form, setForm] = useState({
    destination: '', startDate: '', endDate: '', budget: '', hotel: '', interests: []
  });
  const [itinerary, setItinerary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
 
  const interestOptions = ['food', 'architecture', 'shopping', 'nightlife'];
 
  const toggleInterest = (interest) => {
    setForm(prev => ({
      ...prev,
      interests: prev.interests.includes(interest)
        ? prev.interests.filter(i => i !== interest)
        : [...prev.interests, interest]
    }));
  };
 
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setItinerary(null);
    try {
      const res = await axios.post('http://localhost:5000/api/generate-itinerary', form);
      setItinerary(res.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };
 
  return (
    <div className="app">
      <header className="app-header">
        <p className="kicker">TRIPPILOT — LOGISTICS-AWARE TRIP PLANNING</p>
        <h1>Plan the route,<br />not just the list.</h1>
      </header>
 
      <form className="trip-form" onSubmit={handleSubmit}>
        <div className="field">
          <label>Destination</label>
          <input type="text" value={form.destination}
            onChange={e => setForm({ ...form, destination: e.target.value })} required />
        </div>
 
        <div className="field-row">
          <div className="field">
            <label>Departing</label>
            <input type="date" value={form.startDate}
              onChange={e => setForm({ ...form, startDate: e.target.value })} required />
          </div>
          <div className="field">
            <label>Returning</label>
            <input type="date" value={form.endDate}
              onChange={e => setForm({ ...form, endDate: e.target.value })} required />
          </div>
        </div>
 
        <div className="field-row">
          <div className="field">
            <label>Budget (INR)</label>
            <input type="number" value={form.budget}
              onChange={e => setForm({ ...form, budget: e.target.value })} required />
          </div>
          <div className="field">
            <label>Hotel / base location</label>
            <input type="text" value={form.hotel}
              onChange={e => setForm({ ...form, hotel: e.target.value })} required />
          </div>
        </div>
 
        <div className="field">
          <label>Interests</label>
          <div className="interest-pills">
            {interestOptions.map(i => (
              <button type="button" key={i}
                className={`pill ${form.interests.includes(i) ? 'active' : ''}`}
                onClick={() => toggleInterest(i)}>
                {i}
              </button>
            ))}
          </div>
        </div>
 
        <button className="submit-btn" type="submit" disabled={loading}>
          {loading ? 'PLOTTING ROUTE… (15–25S)' : 'GENERATE ITINERARY'}
        </button>
 
        {error && <p className="error-msg">{error}</p>}
      </form>
 
      {itinerary && (
        <div className="results">
          <div className="results-header">
            <h2>{itinerary.destination}</h2>
            <p className="weather-line">{itinerary.weatherSummary}</p>
          </div>
 
          {itinerary.days.map((day, i) => (
            <div key={i}>
              <div className="day-divider">
                <span className="date">DAY {i + 1} — {day.date}</span>
                <span className="perforation"></span>
              </div>
 
              <div className="route">
                {day.stops.map((stop, j) => (
                  <div key={j}>
                    {stop.travelFromPrevious && (
                      <div className="travel-leg">
                        {stop.travelFromPrevious.durationMinutes} min · {stop.travelFromPrevious.distanceKm} km
                      </div>
                    )}
                    <div className="stop">
                      <div className="stop-time">{stop.suggestedStartTime}</div>
                      <div className="stop-name">{stop.name}</div>
                      <div className="stop-reason">{stop.reason}</div>
                      <div className="stop-meta">₹{stop.estimatedCost} · {stop.durationMinutes} min</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
 
export default App;
 