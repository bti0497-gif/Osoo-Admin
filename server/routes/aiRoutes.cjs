const express = require('express');
const multer = require('multer');
const router = express.Router();

const upload = multer({ storage: multer.memoryStorage() });

// Gemini API Configuration
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

// POST /api/generate-content
// Gemini AI API를 호출하여 이미지에서 텍스트 추출
router.post('/api/generate-content', upload.single('image'), async (req, res) => {
  try {
    const { prompt, model } = req.body;
    const image = req.file;

    if (!image) {
      return res.status(400).json({ error: '이미지 파일이 필요합니다.' });
    }

    if (!prompt) {
      return res.status(400).json({ error: '프롬프트가 필요합니다.' });
    }

    // Check for custom API key from header
    const customApiKey = req.headers['x-custom-api-key'];
    const apiKey = customApiKey || GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: 'Gemini API 키가 설정되지 않았습니다.' });
    }

    // Convert image buffer to base64
    const base64Image = image.buffer.toString('base64');

    // Prepare Gemini API request
    const requestBody = {
      contents: [
        {
          parts: [
            {
              text: prompt,
            },
            {
              inline_data: {
                mime_type: image.mimetype,
                data: base64Image,
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 4096,
      },
    };

    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Gemini API Error]', errorText);
      return res.status(500).json({ error: 'Gemini API 호출 실패', details: errorText });
    }

    const data = await response.json();
    const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    res.json({ text: generatedText });
  } catch (err) {
    console.error('[AI Routes] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = () => router;
