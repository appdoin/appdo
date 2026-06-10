// =============================================================
//  Groq AI Service — Review Comment Generation (User Panel)
//  Generates unique review comments on-the-fly if not pre-generated
// =============================================================

const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'

// Word count rules per comment_length setting
const LENGTH_CONFIG = {
  short:  { rule: 'strictly 2 to 4 words total',   max_tokens: 30  },
  medium: { rule: 'strictly 6 to 9 words total',   max_tokens: 50  },
  long:   { rule: 'strictly 15 to 25 words total',  max_tokens: 100 },
}

/**
 * Generate a unique, natural-sounding review comment for an app.
 * @param {Object} appDetails - { name, description, category, language, comment_length }
 * @param {string[]} existingComments - Previously generated comments (to avoid duplicates)
 * @returns {Promise<string>} The generated review comment
 */
export async function generateReviewComment(appDetails, existingComments = []) {
  const { name, description, category, language, comment_length } = appDetails
  const lang = language || 'hinglish'
  const lengthKey = comment_length || 'short'
  const { rule, max_tokens } = LENGTH_CONFIG[lengthKey] || LENGTH_CONFIG.short

  const avoidList = existingComments.length > 0
    ? `\n\nIMPORTANT: These comments have already been generated for other users. Write something COMPLETELY DIFFERENT:\n${existingComments.slice(-10).map((c, i) => `${i + 1}. "${c}"`).join('\n')}`
    : ''

  const languageInstruction = lang === 'english'
    ? `2. Write in PURE ENGLISH — natural, casual, conversational American/Indian English. Do NOT mix Hindi words.
   Example tones: "This app is really smooth and fast", "Love how easy it is to navigate", "Pretty good for what it does"`
    : `2. Write in HINGLISH — mix Hindi and English naturally like real Indian users do on Play Store.
   Example tones: "Bahut accha app hai, smooth chalti hai", "Mast app, kaam ki cheez", "Yeh app mujhe pasand aayi, easy hai use karna"`

  const prompt = `You are a real Indian user who just installed and used an Android app. Write a genuine, natural Play Store review comment.

App Name: ${name}
Category: ${category || 'General'}
Description: ${description || 'A useful mobile application'}

Rules:
1. Write ONLY the review comment text — no quotes, no prefixes, no labels
${languageInstruction}
3. LENGTH: ${rule} — this is STRICT, do not exceed or go below. Calculate word count before outputting.
4. Be specific about features or experience (unless length is short, in which case a generic short positive phrase is fine)
5. Use natural variations — sometimes start with the app name, sometimes with "I"/"Main", sometimes with an action
6. Include minor natural imperfections (like "its" instead of "it's" sometimes, or casual abbreviations)
7. Don't use emojis excessively — max 1 if at all
8. Don't mention "Play Store" or "download" or "review"
9. Vary the tone — sometimes enthusiastic, sometimes calm, sometimes practical
10. Make it feel like a real person's honest opinion${avoidList}`

  const res = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: `You write realistic Play Store app reviews. Output ONLY the review text, nothing else. No quotes. Strictly follow the word count: ${rule}.` },
        { role: 'user', content: prompt },
      ],
      temperature: 1.1,
      max_tokens,
      top_p: 0.95,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Groq API error: ${res.status} — ${err}`)
  }

  const data = await res.json()
  let comment = data.choices?.[0]?.message?.content?.trim() || ''
  comment = comment.replace(/^[\"']+|[\"']+$/g, '').trim()
  if (!comment) throw new Error('Empty response from Groq')
  return comment
}
