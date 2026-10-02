// Vercel Serverless Function for Chronicles signup
const GC_API_KEY = process.env.GC_API_KEY;
const GC_BASE_URL = 'https://api.globalcontrol.io/api/ai';

const TAGS = {
  IRIS: '6abf0b7daf2cbfcf3c19b89f',
  CHRONICLES: '6abf0b7daf2cbfcf3c19b8a2',
  GETRESPONSE: '69c60ba8d655965de91e6ff1',
  AI_SESSIONS: '6abf0b7eaf2cbfcf3c19b8a7',
  WORKFLOW_TRIGGER: '6a1479b89623b6235fdfca83', // ai-sessions-subscriber — triggers the welcome email workflow
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { email, firstName, source = 'chronicles-signup-page' } = req.body;
    if (!email || !firstName) return res.status(400).json({ error: 'Email and first name are required' });
    if (!GC_API_KEY) return res.status(500).json({ error: 'Server configuration error' });

    const cleanEmail = email.toLowerCase().trim();
    const cleanName = firstName.trim();

    const gcResponse = await fetch(`${GC_BASE_URL}/contacts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-KEY': GC_API_KEY },
      body: JSON.stringify({ email: cleanEmail, firstName: cleanName, source }),
    });

    let contactId = null;
    let contactExists = false;

    if (gcResponse.ok) {
      const gcData = await gcResponse.json();
      contactId = gcData.data?._id || gcData._id || null;
    } else if (gcResponse.status === 409) {
      contactExists = true;
      const searchResponse = await fetch(
        `${GC_BASE_URL}/contacts?search=${encodeURIComponent(cleanEmail)}`,
        { headers: { 'X-API-KEY': GC_API_KEY } }
      );
      if (searchResponse.ok) {
        const searchData = await searchResponse.json();
        const contacts = searchData.data || searchData;
        if (Array.isArray(contacts) && contacts.length > 0) contactId = contacts[0]._id;
      }
    } else {
      const error = await gcResponse.json();
      console.error('GC API error:', error);
      return res.status(500).json({ error: 'Failed to subscribe. Please try again.' });
    }

    // Fire all tags using email (contactId fails with "Invalid Contact Email")
    const tagPromises = Object.values(TAGS).map((tagId) =>
      fetch(`${GC_BASE_URL}/tags/fire-tag/${tagId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-KEY': GC_API_KEY },
        body: JSON.stringify({ email: cleanEmail }),
      })
    );
    const tagResults = await Promise.allSettled(tagPromises);
    tagResults.forEach((result, index) => {
      if (result.status === 'rejected') console.error(`Failed to fire tag ${Object.keys(TAGS)[index]}:`, result.reason);
    });

    return res.status(200).json({
      success: true,
      contactExists,
      message: contactExists ? 'Welcome back! Your tags have been updated.' : 'Welcome to The AI Sessions! Check your email for next steps.',
    });
  } catch (error) {
    console.error('Subscribe API error:', error);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
};
