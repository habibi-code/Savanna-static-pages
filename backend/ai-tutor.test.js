import assert from 'node:assert/strict';
import test from 'node:test';
import router, {
  PluggableAIService,
  detectQueryLanguage,
  buildTutorSystemPrompt,
  createFallbackAudioBuffer
} from './ai-tutor.js';

async function dispatchTutor(query, lang = 'en', forceOffline = false, customApp = {}) {
  const req = {
    method: 'POST',
    url: '/api/ai-tutor',
    headers: { 'content-type': 'application/json', host: 'localhost:3000' },
    protocol: 'http',
    body: { query, lang, forceOffline },
    app: {
      get: (k) => customApp[k] ?? null,
      ...customApp,
    }
  };
  return new Promise((resolve) => {
    let statusCode = 200;
    const res = {
      status(code) { statusCode = code; return this; },
      json(data) { resolve({ status: statusCode, body: data }); }
    };
    const handlers = router.stack.filter(s => s.route && s.route.path === '/ai-tutor');
    handlers[0].route.stack[0].handle(req, res);
  });
}

test('ai-tutor validates query and lang inputs', async () => {
  const emptyRes = await dispatchTutor('');
  assert.equal(emptyRes.status, 400);

  const missingRes = await dispatchTutor(null);
  assert.equal(missingRes.status, 400);

  const badLangRes = await dispatchTutor('valid query', 'fr');
  assert.equal(badLangRes.status, 400);
});

test('ai-tutor handles fuzzy search and typos for lesson concepts', async () => {
  // Deliberate typos: "excludd", "butons", "navigashun"
  const res = await dispatchTutor('tell me about excludd butons and navigashun');
  assert.equal(res.status, 200);
  assert.match(res.body.answer, /filter|excluded|navigation|Reader Mode/i);
  assert.equal(res.body.citation, 'Lesson content (assets/learning-companion/lesson-content.js)');
  assert.ok(res.body.source_url);
});

test('ai-tutor formats answers as a friendly tutor with bullet points and analogies', async () => {
  const res = await dispatchTutor('What elements are retained during extraction?');
  assert.equal(res.status, 200);
  assert.ok(res.body.answer.includes('- '));
  assert.ok(res.body.answer.includes('Analogy:'));
  assert.equal(res.body.citation, 'Lesson content (assets/learning-companion/lesson-content.js)');
});

test('ai-tutor queries job data and returns career citations', async () => {
  const jobQueries = [
    { q: 'Tell me about the Executive Virtual Assistant job at Nexus', expectTitle: /Executive Virtual Assistant/i, expectCompany: /Nexus Global Technologies/i },
    { q: 'Are there social media coordinator remote jobs?', expectTitle: /Social Media/i, expectCompany: /Bloom/i },
    { q: 'What skills are required for the e-commerce customer support role?', expectTitle: /Customer Support/i, expectCompany: /Savanna Commerce/i },
  ];

  for (const { q, expectTitle, expectCompany } of jobQueries) {
    const res = await dispatchTutor(q);
    assert.equal(res.status, 200);
    assert.match(res.body.answer, expectTitle);
    assert.match(res.body.answer, expectCompany);
    assert.match(res.body.citation, /Job Opportunities/i);
    assert.ok(res.body.source_url);
  }
});

test('ai-tutor seamlessly falls back to offline-faq.json when primary RAG fails or cloud drops', async () => {
  // 1. Force offline mode to test offline fallback
  const resOffline = await dispatchTutor('What happens when the tutor is offline or disconnected?', 'en', true);
  assert.equal(resOffline.status, 200);
  assert.match(resOffline.body.answer, /offline emergency knowledge base|offline mode/i);
  assert.match(resOffline.body.citation, /Offline FAQ/i);

  // 2. Simulated primary failure throwing error
  const failingService = new PluggableAIService({
    primaryProvider: {
      async search() {
        throw new Error('Cloud API Network Timeout (simulated)');
      }
    }
  });

  const resErrorFallback = await dispatchTutor(
    'How do I prepare for a remote Virtual Assistant career?',
    'en',
    false,
    { aiService: failingService }
  );
  assert.equal(resErrorFallback.status, 200);
  assert.match(resErrorFallback.body.answer, /remote VA career|Google Workspace|tools/i);
  assert.match(resErrorFallback.body.citation, /Offline FAQ/i);
});

test('ai-tutor strictly enforces anti-hallucination guardrail on out-of-scope queries', async () => {
  const outOfScopeQueries = [
    'What is the capital of France?',
    'How do I bake a chocolate cake?',
    'Who won the FIFA World Cup in 1998?',
    'Write a python script to sort a list of numbers',
    'What is quantum computing?',
    'Tell me a funny joke about cats',
    'What is the current price of gold?',
  ];

  for (const q of outOfScopeQueries) {
    const res = await dispatchTutor(q);
    assert.equal(res.status, 200);
    assert.equal(
      res.body.answer,
      'I can only explain concepts covered in this lesson. Please ask a question related to the current material.'
    );
    assert.equal(res.body.citation, null);
    assert.equal(res.body.source_url, null);
  }
});

async function dispatchAudioGet(audioUrl) {
  const urlObj = new URL(audioUrl, 'http://localhost:3000');
  const req = {
    method: 'GET',
    url: urlObj.pathname,
    params: { id: urlObj.pathname.split('/').pop() },
    headers: { host: 'localhost:3000' },
  };
  return new Promise((resolve) => {
    let statusCode = 200;
    const headers = {};
    const res = {
      status(code) { statusCode = code; return this; },
      setHeader(k, v) { headers[k.toLowerCase()] = v; },
      send(buf) { resolve({ status: statusCode, headers, buffer: buf }); }
    };
    const handlers = router.stack.filter(s => s.route && s.route.path === '/ai-tutor/audio/:id');
    handlers[0].route.stack[0].handle(req, res);
  });
}

test('Translation Bridge: detects Amharic queries, translates to English for search, and returns Amharic tutor explanation', async () => {
  // Query about excluded elements in Amharic
  const amharicLessonQuery = 'በትምህርት ይዘት ማውጣት ላይ የማይካተቱ ወይም የሚጣሩ አዝራሮች እና አሰሳዎች ምንድን ናቸው?';
  const res = await dispatchTutor(amharicLessonQuery, 'am');
  assert.equal(res.status, 200);
  assert.match(res.body.answer, /የማይካተቱ|የሚጣሩ|አሰሳ|አዝራሮች/u);
  assert.match(res.body.answer, /ምሳሌ|Analogy/u);
  assert.ok(res.body.answer.includes('- '));
  assert.equal(res.body.citation, 'Lesson content (assets/learning-companion/lesson-content.js)');
  assert.ok(res.body.source_url);
  assert.ok(res.body.audio);
  assert.ok(res.body.audio_url);
});

test('Translation Bridge: translates Amharic career queries to English and generates Amharic job explanation', async () => {
  // Query in Amharic asking about Nexus Virtual Assistant job
  const amharicJobQuery = 'በኔክሰስ ድርጅት ውስጥ ስላለው የቨርቹዋል አሲስታንት ስራ እና የስራ እድል አብራራልኝ';
  const res = await dispatchTutor(amharicJobQuery, 'am');
  assert.equal(res.status, 200);
  assert.match(res.body.answer, /Executive Virtual Assistant|ቨርቹዋል አሲስታንት/u);
  assert.match(res.body.answer, /Nexus/i);
  assert.match(res.body.answer, /የስራ ምክር|ምሳሌ|Career Tip/u);
  assert.ok(res.body.answer.includes('- '));
  assert.match(res.body.citation, /Job Opportunities/i);
});

test('Translation Bridge: uses LLM client to translate Amharic query and generate Amharic response', async () => {
  const llmCalls = [];
  const mockClient = {
    chat: {
      completions: {
        async create(params) {
          llmCalls.push(params);
          if (params.system.includes('translator')) {
            return {
              choices: [{ message: { content: 'Tell me about excluded navigation and button elements' } }]
            };
          }
          return {
            choices: [{
              message: {
                content: 'ስለ ተገለሉ የበይነገጽ ክፍሎች የተሰጠ ማብራሪያ፡\n\n- የአሰሳ አሞሌዎች ይወገዳሉ\n- አዝራሮች ይጣራሉ\n\n💡 ምሳሌ፡ Reader Mode መጠቀምን ይመስላል።'
              }
            }]
          };
        }
      }
    }
  };

  const res = await dispatchTutor('ስለማይካተቱ ክፍሎች ንገረኝ', 'am', false, { aiClient: mockClient });
  assert.equal(res.status, 200);
  assert.equal(llmCalls.length, 2);
  // First call translated Amharic query to English
  assert.match(llmCalls[0].system, /translator/i);
  // Second call generated response in Amharic grounded in context
  assert.match(llmCalls[1].system, /አማርኛ|Amharic/u);
  assert.match(res.body.answer, /የአሰሳ አሞሌዎች|አዝራሮች/u);
  assert.match(res.body.answer, /ምሳሌ/u);
});

test('Translation Bridge: enforces fallback guardrail if translated Amharic query is out-of-scope', async () => {
  const outOfScopeAmharic = 'የፈረንሳይ ዋና ከተማ ማን ናት?'; // What is the capital of France?
  const res = await dispatchTutor(outOfScopeAmharic, 'am');
  assert.equal(res.status, 200);
  assert.match(res.body.answer, /በዚህ ትምህርት ውስጥ የተካተቱ ፅንሰ ሀሳቦችን ብቻ ማብራራት እችላለሁ/u);
  assert.equal(res.body.citation, null);
  assert.equal(res.body.source_url, null);
});

test('Cloud TTS Integration: generates audio data and exposes audio buffer via audio endpoint', async () => {
  const res = await dispatchTutor('What elements are excluded?');
  assert.equal(res.status, 200);
  assert.ok(res.body.audio.startsWith('data:audio/'));
  assert.ok(res.body.audio_url);

  // Test GET audio route
  const audioRes = await dispatchAudioGet(res.body.audio_url);
  assert.equal(audioRes.status, 200);
  assert.match(audioRes.headers['content-type'], /audio\/(wav|mpeg)/);
  assert.ok(Buffer.isBuffer(audioRes.buffer));
  assert.ok(audioRes.buffer.length > 0);
});

test('Cloud TTS Integration: calls cloud voice generator when client is configured', async () => {
  let voiceParams = null;
  const mockClient = {
    voice: {
      async generate(params) {
        voiceParams = params;
        return {
          id: 'test-clip-123',
          audioUrl: 'https://cloud-cdn.example/tutor-speech.mp3',
          async arrayBuffer() {
            return Buffer.from('mock mp3 audio bytes');
          }
        };
      }
    }
  };

  const res = await dispatchTutor('What elements are retained during extraction?', 'en', false, { aiClient: mockClient });
  assert.equal(res.status, 200);
  assert.ok(voiceParams);
  assert.equal(voiceParams.voiceId, 'am-hamen');
  assert.ok(res.body.audio.startsWith('data:audio/mpeg;base64,'));
  assert.equal(res.body.audio_url, 'https://cloud-cdn.example/tutor-speech.mp3');
});

test('jobs-data.json includes Available Jobs and Interview Accommodations', async () => {
  // 1. Available Jobs query
  const resJobs = await dispatchTutor('What available jobs are there for remote Virtual Assistant roles?');
  assert.equal(resJobs.status, 200);
  assert.match(resJobs.body.answer, /Available Jobs/i);
  assert.match(resJobs.body.answer, /remote Virtual Assistant roles/i);
  assert.match(resJobs.body.citation, /Job Opportunities.*Available Jobs/i);
  assert.ok(resJobs.body.source_url);

  // 2. Interview Accommodations query
  const resAccommodations = await dispatchTutor('What interview accommodations are provided for candidates with disabilities?');
  assert.equal(resAccommodations.status, 200);
  assert.match(resAccommodations.body.answer, /Interview Accommodations/i);
  assert.match(resAccommodations.body.answer, /extended time/i);
  assert.match(resAccommodations.body.answer, /screen readers/i);
  assert.match(resAccommodations.body.citation, /Job Opportunities.*Interview Accommodations/i);
  assert.ok(resAccommodations.body.source_url);
});

test('Language detection: user asking in English even with lang="am" instructs LLM to reply in English', async () => {
  const llmCalls = [];
  const mockClient = {
    chat: {
      completions: {
        async create(params) {
          llmCalls.push(params);
          return {
            choices: [{
              message: {
                content: 'Here is an explanation of excluded elements:\n\n- Navigation menus are stripped\n- Form buttons are excluded\n\n💡 Helpful Analogy: Think of it like reader mode in your browser!'
              }
            }]
          };
        }
      }
    }
  };

  // User query is in English, but the UI or request passed lang: 'am'
  const res = await dispatchTutor('What elements are excluded during lesson extraction?', 'am', false, { aiClient: mockClient });
  assert.equal(res.status, 200);
  // Only 1 LLM call was needed (no translation bridge since query was already English)
  assert.equal(llmCalls.length, 1);
  assert.match(llmCalls[0].system, /The user asked their question in English\. You must explicitly reply entirely in English\./);
  assert.doesNotMatch(llmCalls[0].system, /reply entirely in Amharic/);
  assert.match(res.body.answer, /excluded elements/i);
});

test('Language detection: user asking in Amharic instructs LLM to reply in Amharic', async () => {
  const llmCalls = [];
  const mockClient = {
    chat: {
      completions: {
        async create(params) {
          llmCalls.push(params);
          if (params.system.includes('translator')) {
            return { choices: [{ message: { content: 'Tell me about excluded navigation and button elements' } }] };
          }
          return {
            choices: [{
              message: {
                content: 'ስለ ተገለሉ የበይነገጽ ክፍሎች ማብራሪያ፡\n\n- የአሰሳ አሞሌዎች ይወገዳሉ\n- አዝራሮች ይጣራሉ\n\n💡 ምሳሌ፡ Reader Mode መጠቀምን ይመስላል።'
              }
            }]
          };
        }
      }
    }
  };

  const res = await dispatchTutor('በትምህርት ይዘት ማውጣት ላይ የማይካተቱ ክፍሎች የትኞቹ ናቸው?', 'en', false, { aiClient: mockClient });
  assert.equal(res.status, 200);
  assert.equal(llmCalls.length, 2);
  assert.match(llmCalls[1].system, /The user asked their question in Amharic \(አማርኛ\)\. You must explicitly reply entirely in Amharic \(አማርኛ\)\./);
  assert.match(res.body.answer, /የአሰሳ አሞሌዎች|አዝራሮች/u);
});

test('System prompt enforces Expert Tutor persona, bullet points, analogy and strict grounding', () => {
  const enPrompt = buildTutorSystemPrompt('en');
  assert.match(
    enPrompt,
    /You are an expert, patient AI Tutor\. I will provide you with a \[CONTEXT\] block of facts\. You must read these facts and EXPLAIN them to the student in a conversational, easy-to-understand way\. Do not just repeat the raw text\. Break down the core concepts, define any jargon, and teach the material\./
  );
  assert.match(
    enPrompt,
    /The explanation must still include bullet points for readability and one clear, real-world analogy to help the student visualize the concept\./
  );
  assert.match(
    enPrompt,
    /Your explanation must be based 100% on the provided \[CONTEXT\]\. Do not introduce outside information or hallucinate\./
  );
  assert.match(
    enPrompt,
    /The user asked their question in English\. You must explicitly reply entirely in English\./
  );

  const amPrompt = buildTutorSystemPrompt('am');
  assert.match(
    amPrompt,
    /The user asked their question in Amharic \(አማርኛ\)\. You must explicitly reply entirely in Amharic \(አማርኛ\)\./
  );
});

test('Case 2: API Outage (500/429/timeout) catches API error and serves pre-written answer from offline-faq.json', async () => {
  const mockFailingClient = {
    chat: {
      completions: {
        async create() {
          const err = new Error('Cloud AI Provider Rate Limit / Outage (simulated 429)');
          err.status = 429;
          throw err;
        }
      }
    }
  };

  const res = await dispatchTutor(
    'How can I prepare for a remote Virtual Assistant career?',
    'en',
    false,
    { aiClient: mockFailingClient }
  );

  assert.equal(res.status, 200);
  assert.match(res.body.answer, /remote VA career|Google Workspace|tools/i);
  assert.match(res.body.citation, /Offline FAQ/i);
  assert.ok(res.body.answer.includes('- '));
  assert.ok(res.body.answer.includes('Analogy:'));
});

test('Case 3: Completely Offline serves offline-faq.json and creates fallback audio buffer without broken links', async () => {
  const res = await dispatchTutor(
    'What happens when the tutor is offline or cloud connection is lost?',
    'en',
    true // forceOffline: true
  );

  assert.equal(res.status, 200);
  assert.match(res.body.answer, /offline emergency knowledge base|offline mode/i);
  assert.match(res.body.citation, /Offline FAQ/i);
  assert.ok(res.body.audio.startsWith('data:audio/wav;base64,'));
  assert.ok(res.body.audio_url);

  // Probe audio endpoint to verify local fallback audio buffer is served properly
  const audioRes = await dispatchAudioGet(res.body.audio_url);
  assert.equal(audioRes.status, 200);
  assert.equal(audioRes.headers['content-type'], 'audio/wav');
  assert.ok(Buffer.isBuffer(audioRes.buffer));
  const expectedFallback = createFallbackAudioBuffer();
  assert.equal(audioRes.buffer.length, expectedFallback.length);
});

test('Offline FAQ resolves career and available jobs inquiries without keyword collision', async () => {
  const res = await dispatchTutor(
    'Are there any jobs available for remote workers?',
    'en',
    true // forceOffline: true
  );

  assert.equal(res.status, 200);
  assert.match(res.body.answer, /Swiss Army knife/i);
  assert.match(res.body.answer, /remote jobs available for Virtual Assistants/i);
  assert.match(res.body.citation, /Offline FAQ/i);
});
