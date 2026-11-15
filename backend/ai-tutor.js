// Express router for AI-Tutor (RAG) endpoint with Pluggable AI and Offline Fallback
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import jobsData from './jobs-data.json' with { type: 'json' };

const __dirname = dirname(fileURLToPath(import.meta.url));

// Resolve data file locations
const lessonPath = resolve(
  __dirname,
  '..',
  'assets',
  'learning-companion',
  'lesson-content.js'
);
const conceptHtmlPath = resolve(
  __dirname,
  '..',
  'pages',
  'concept-with-navigation.html'
);
const backendJobsPath = resolve(__dirname, 'jobs-data.json');
const assetsJobsPath = resolve(
  __dirname,
  '..',
  'assets',
  'learning-companion',
  'jobs-data.json'
);
const backendFaqPath = resolve(__dirname, 'offline-faq.json');
const assetsFaqPath = resolve(
  __dirname,
  '..',
  'assets',
  'learning-companion',
  'offline-faq.json'
);

// Fallback message strictly required when queries cannot be answered from material
const OUT_OF_SCOPE_FALLBACK =
  'I can only explain concepts covered in this lesson. Please ask a question related to the current material.';

// Fallback message for Amharic queries
const AMHARIC_OUT_OF_SCOPE_FALLBACK =
  'በዚህ ትምህርት ውስጥ የተካተቱ ፅንሰ ሀሳቦችን ብቻ ማብራራት እችላለሁ። እባክዎ አሁን ካለው ይዘት ጋር የተያያዘ ጥያቄ ይጠይቁ።';

// Amharic concept dictionary for offline fallback and offline testing
const AMHARIC_DICTIONARY = [
  // Lesson concepts
  { pattern: /(አይካተቱም|የማይካተቱ|የተገለሉ|የሚወገዱ|ይወገዳሉ|አይካተትም|ማጣሪያ|የተጣሩ)/u, term: 'excluded elements filtered remove' },
  { pattern: /(አሰሳ|ናቪጌሽን|ዳሰሳ)/u, term: 'navigation menu' },
  { pattern: /(አዝራር|አዝራሮች|ቁልፍ|ቁልፎች)/u, term: 'button buttons' },
  { pattern: /(ቅጽ|ቅጾች|ፎርም)/u, term: 'form forms input' },
  { pattern: /(ይዘት|ትምህርት|ጽሑፍ)/u, term: 'lesson content excerpt text' },
  { pattern: /(የተያዙ|የሚቀሩ|የሚካተቱ|የሚጠበቁ)/u, term: 'retained elements included body' },
  { pattern: /(ምስል|ምስሎች)/u, term: 'image images visuals alt' },
  { pattern: /(አርእስት|ርዕስ)/u, term: 'heading title' },
  { pattern: /(ማጠቃለያ)/u, term: 'summary' },
  { pattern: /(የወደፊት|ወደፊት|እድገት|ለውጥ)/u, term: 'future industry evolving shaping' },
  { pattern: /(ሳቫና|መቼት|ነባሪ)/u, term: 'savanna configuration selectors defaults' },
  { pattern: /(አስተናጋጅ|ማገናኘት|ብጁ)/u, term: 'host configuration hostfor embed' },
  { pattern: /(መፈለግ|ማግኘት|አካባቢ)/u, term: 'find lesson findlesson closest' },
  { pattern: /(መደበቅ|የተደበቀ|እይታ)/u, term: 'visibility checks isexcluded isavailable' },
  { pattern: /(መገልበጥ|ቅጂ|ማዘጋጀት)/u, term: 'copy content copycontent' },
  { pattern: /(ማውጣት|ማጠናቀር)/u, term: 'extract lesson extractlesson' },

  // Job & career concepts
  { pattern: /(ስራ|ስራዎች|የስራ|የሥራ|ቅጥር|ክፍት|ዕድል)/u, term: 'job jobs career opportunities hiring vacancy' },
  { pattern: /(ቨርቹዋል\s*አሲስታንት|ረዳት)/u, term: 'Virtual Assistant Executive' },
  { pattern: /(ማህበራዊ\s*ሚዲያ)/u, term: 'Social Media coordinator' },
  { pattern: /(ደንበኛ|ደንበኞች|አገልግሎት|ድጋፍ)/u, term: 'Customer Support specialist representative' },
  { pattern: /(ክህሎት|ክህሎቶች|ችሎታ)/u, term: 'skills requirements qualifications' },
  { pattern: /(የርቀት|ከቤት|ኦንላይን)/u, term: 'remote online' },
  { pattern: /(ደመወዝ|ክፍያ)/u, term: 'salary pay compensation' },
  { pattern: /(ኔክሰስ)/u, term: 'Nexus Global Technologies' },
  { pattern: /(ብሉም)/u, term: 'Bloom' },
  { pattern: /(ሳቫና)/u, term: 'Savanna Commerce' },
  { pattern: /(አፕላይ|ማመልከት|ማመልከቻ)/u, term: 'apply application' },
  { pattern: /(ክፍት\s*ስራ|ያሉ\s*ስራዎች|የስራ\s*እድሎች)/u, term: 'available jobs remote virtual assistant roles' },
  { pattern: /(ማመቻቸት|ማመቻቸቶች|ተደራሽነት|ተጨማሪ\s*ጊዜ|ስክሪን\s*አንባቢ|ቃለ\s*መጠይቅ)/u, term: 'interview accommodations extended time screen readers accessibility' },

  // Offline FAQ
  { pattern: /(ኦፍላይን|ኢንተርኔት\s*ሲቋረጥ|ያለ\s*ኢንተርኔት|ግንኙነት)/u, term: 'offline disconnected fallback' },

  // Out of scope words (mapped so fuzzy search sees they aren't in lesson)
  { pattern: /(ፈረንሳይ|ፓሪስ|ዋና\s*ከተማ)/u, term: 'France Paris capital city' },
  { pattern: /(ኬክ|ቸኮሌት|መጋገር)/u, term: 'bake chocolate cake recipe' },
  { pattern: /(ዓለም\s*ዋንጫ|እግር\s*ኳስ)/u, term: 'FIFA World Cup soccer football' },
  { pattern: /(ፓይዘን|ኮድ|ስክሪፕት)/u, term: 'python script code sort' },
  { pattern: /(ኳንተም|ኮምፒውተር)/u, term: 'quantum computing' },
  { pattern: /(ድመት|ቀልድ)/u, term: 'cat joke funny' },
  { pattern: /(ወርቅ|ዋጋ)/u, term: 'gold price current' },
];

export function offlineTranslateAmharic(query) {
  const matches = [];
  for (const entry of AMHARIC_DICTIONARY) {
    if (entry.pattern.test(query)) {
      matches.push(entry.term);
    }
  }
  if (matches.length > 0) {
    return matches.join(' ');
  }
  return query;
}

export async function translateQueryToEnglish(query, client) {
  if (client?.chat?.completions) {
    try {
      const completion = await client.chat.completions.create(
        {
          system: [
            'You are an expert Amharic-to-English translator for an educational search system.',
            'Translate the user query from Amharic into clear, concise English search keywords and phrases.',
            'Preserve all technical concepts, job names, tools, actions, and questions accurately.',
            'Return ONLY the direct English translation without commentary, prefixes, or quotation marks.',
          ].join(' '),
          messages: [{ role: 'user', content: query }],
          temperature: 0.1,
          max_tokens: 300,
        },
        { timeout: 15000 }
      );
      const translated = completion.choices?.[0]?.message?.content?.trim();
      if (translated) return translated;
    } catch (e) {
      console.warn('LLM Amharic translation failed, using fallback:', e.message);
    }
  }

  if (client?.translate?.create) {
    try {
      const res = await client.translate.create({ text: query, from: 'am', to: 'en' }, { timeout: 15000 });
      if (res?.text?.trim()) return res.text.trim();
    } catch (e) {
      console.warn('Translation service failed, using fallback:', e.message);
    }
  }

  return offlineTranslateAmharic(query);
}

// Common stop words to exclude from keyword extraction
const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'all', 'am', 'an', 'and', 'any', 'are', 'as',
  'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but',
  'by', 'can', 'could', 'did', 'do', 'does', 'doing', 'down', 'during', 'each', 'explain',
  'few', 'for', 'from', 'further', 'had', 'has', 'have', 'having', 'he', 'her', 'here',
  'hers', 'herself', 'him', 'himself', 'his', 'how', 'i', 'if', 'in', 'into', 'is', 'it',
  'its', 'itself', 'just', 'me', 'more', 'most', 'my', 'myself', 'no', 'nor', 'not',
  'of', 'off', 'on', 'once', 'only', 'or', 'other', 'ought', 'our', 'ours', 'ourselves',
  'out', 'over', 'own', 'same', 'she', 'should', 'so', 'some', 'such', 'tell', 'than',
  'that', 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'these',
  'they', 'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up', 'very',
  'was', 'we', 'were', 'what', 'when', 'where', 'which', 'while', 'who', 'whom',
  'why', 'with', 'would', 'you', 'your', 'yours', 'yourself', 'yourselves', 'please',
  'help', 'show', 'give', 'hi', 'hello', 'hey', 'know', 'think', 'mean', 'write'
]);

// Generic English words that occur in many non-lesson contexts
const GENERIC_WORDS = new Set([
  'list', 'lists', 'text', 'content', 'elements', 'tags', 'image', 'images', 'check',
  'checks', 'tools', 'work', 'workplace', 'future', 'roles', 'number', 'numbers', 'call'
]);

function stem(word) {
  if (word.length <= 3) return word.toLowerCase();
  return word
    .toLowerCase()
    .replace(/(ing|edly|ingly|ed|es|s|ation|tion|ment|able|ity|e)$/i, '');
}

function tokenize(text) {
  if (typeof text !== 'string') return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, ' ')
    .split(/\s+/)
    .map(w => w.trim())
    .filter(w => w.length > 1 && !STOP_WORDS.has(w));
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      matrix[i][j] =
        b.charAt(i - 1) === a.charAt(j - 1)
          ? matrix[i - 1][j - 1]
          : Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
    }
  }
  return matrix[b.length][a.length];
}

function matchWord(qWord, cWord) {
  const qw = qWord.toLowerCase();
  const cw = cWord.toLowerCase();
  if (qw === cw) return { type: 'exact', weight: 1.0 };

  const s1 = stem(qw);
  const s2 = stem(cw);
  if (s1 === s2) return { type: 'stem', weight: 0.9 };

  // Common prefix match (e.g. navigashun / navigation, excludd / excluded)
  if (qw.length >= 5 && cw.length >= 5 && qw.slice(0, 5) === cw.slice(0, 5) && Math.abs(qw.length - cw.length) <= 2) {
    return { type: 'prefix', weight: 0.8 };
  }

  // Edit distance fuzzy match for typos
  const maxLen = Math.max(qw.length, cw.length);
  if (maxLen >= 4 && Math.abs(qw.length - cw.length) <= 2) {
    const dist = levenshtein(qw, cw);
    if ((dist <= 1 && maxLen <= 6) || (dist <= 2 && maxLen > 6)) {
      return { type: 'fuzzy', weight: 0.75 };
    }
  }

  return null;
}

// Built-in grounded knowledge model for lesson-content.js concepts
const BUILTIN_LESSON_CONCEPTS = [
  {
    id: 'excluded_elements',
    title: 'Excluded Elements in Lesson Extraction',
    strongKeywords: [
      'exclude', 'excluded', 'filter', 'nav', 'navigation', 'footer', 'button', 'buttons',
      'form', 'forms', 'input', 'select', 'textarea', 'progress', 'meter', 'script',
      'style', 'template', 'noscript', 'iframe', 'svg', 'hidden', 'inert', 'aria-hidden',
      'role', 'strip', 'omit'
    ],
    moderateKeywords: ['controls', 'chrome', 'remove', 'ignore', 'menu', 'menus'],
    citation: 'Lesson content (assets/learning-companion/lesson-content.js)',
    source_url: '/pages/concept-with-navigation.html',
    tutorExplanation: `When Inklu extracts lesson material, it filters out interface elements so you can focus purely on learning.

Here is what gets excluded:
- **Navigation and interface menus:** Tags like \`<nav>\`, \`<footer>\`, and elements with navigation roles are removed so course chrome doesn't clutter the lesson.
- **Interactive form controls:** Elements such as \`<button>\`, \`<input>\`, \`<select>\`, and \`<form>\` are stripped out because they represent user actions rather than lesson reading.
- **Technical and code tags:** Non-text or technical elements like \`<script>\`, \`<style>\`, \`<iframe>\`, and \`<svg>\` are excluded.
- **Hidden content:** Any element marked with \`display: none\`, \`visibility: hidden\`, \`hidden\`, or \`inert\` is ignored.

💡 **Helpful Analogy:** Think of this like "Reader Mode" in a web browser—it removes all the surrounding website buttons and ads, leaving only the clean, readable article!`,
    amharicExplanation: `በInklu የትምህርት ይዘት ማውጣት ሂደት፣ ተማሪዎች በትምህርቱ ላይ ብቻ እንዲያተኩሩ የሚከተሉት የበይነገጽ ክፍሎች ይጣራሉ (ይወገዳሉ)፦

- **የአሰሳ እና የበይነገጽ ማውጫዎች፦** እንደ <nav>፣ <footer> እና የአሰሳ መመሪያዎች ያሉ ክፍሎች ትምህርቱን እንዳያጨናንቁ ይወገዳሉ።
- **የመስተጋብር ቅጾች እና አዝራሮች፦** እንደ <button>፣ <input>፣ <select> እና <form> ያሉ ተጠቃሚው የሚጫናቸው ቁልፎች ይጣራሉ።
- **ቴክኒካል እና ስክሪፕት ታጎች፦** እንደ <script>፣ <style>፣ <iframe> እና <svg> ያሉ ይዘቶች አይካተቱም።
- **የተደበቁ ይዘቶች፦** በማሳያው ላይ የማይታዩ (display: none ወይም hidden) የሆኑ ክፍሎች በሙሉ ይተዋሉ።

💡 **ምሳሌ (Analogy)፦** ይህ ልክ በድረ-ገጽ ላይ Reader Mode ን እንደማብራት ነው—ማስታወቂያዎችን እና አዝራሮችን አስወግዶ ንጹህ የንባብ ጽሑፉን ብቻ እንደሚያስቀር!`,
  },
  {
    id: 'retained_elements',
    title: 'Retained Elements in Lesson Extraction',
    strongKeywords: [
      'retain', 'retained', 'headings', 'heading', 'paragraph', 'blockquote',
      'figcaption', 'emphasis', 'bold', 'italic', 'strong', 'em'
    ],
    moderateKeywords: ['preserved', 'allowed', 'tags', 'elements', 'list', 'lists', 'figure'],
    citation: 'Lesson content (assets/learning-companion/lesson-content.js)',
    source_url: '/pages/concept-with-navigation.html',
    tutorExplanation: `Inklu carefully preserves important formatting elements to make sure the extracted lesson is structured and easy to read.

Here are the elements that are retained:
- **Headings (\`<h1>\` through \`<h6>\`):** Preserves section titles and subheadings to maintain the lesson's visual hierarchy.
- **Paragraphs (\`<p>\`):** Keeps the body text cleanly separated.
- **Lists (\`<ul>\`, \`<ol>\`, \`<li>\`):** Preserves bulleted lists, numbered steps, list start numbers, and item values.
- **Rich media and quotes:** Retains \`<blockquote>\` for quotations, as well as \`<figure>\` and \`<figcaption>\` for captioned illustrations.
- **Emphasis tags:** Retains \`<strong>\` and \`<em>\` so key terminology and highlighted points remain emphasized.

💡 **Helpful Analogy:** It's like keeping the bold chapter headings, bulleted summaries, and pull-quotes from a textbook while trimming away unrelated margins!`,
    amharicExplanation: `በInklu የትምህርት ይዘት ማውጣት ሂደት፣ ትምህርቱ የተዋቀረና ለማንበብ ግልጽ እንዲሆን የሚከተሉት ጠቃሚ ክፍሎች ተጠብቀው ይቀራሉ፦

- **ዋና ዋና አርዕስቶች፦** የትምህርቱን አደረጃጀት ለመጠበቅ የክፍል አርዕስቶች ይቀራሉ።
- **አንቀጾች፦** ዋናው የንባብ ጽሑፍ በንጽሕና ተለይቶ ይቀመጣል።
- **ዝርዝሮች፦** ነጥቦች እና የደረጃ በደረጃ ቁጥሮች እንዳሉ ይጠበቃሉ።
- **ጥቅሶች እና ምስሎች፦** ለትምህርቱ የተካተቱ ጥቅሶች እና የምስል ማብራሪያዎች ይቀመጣሉ።
- **የአጽንዖት ምልክቶች፦** ጠቃሚ ቃላትን የሚያጎሉ ጽሑፎች ተጠብቀው ይቀራሉ።

💡 **ምሳሌ (Analogy)፦** ይህ ልክ ከመማሪያ መጽሐፍ ላይ ጠቃሚ ማስታወሻዎችን እና ርዕሶችን በደብተራችን ላይ በጥንቃቄ እንደመመዝገብ ነው!`,
  },
  {
    id: 'savanna_configuration',
    title: 'Savanna LMS Configuration Defaults',
    strongKeywords: [
      'savanna', 'selectors', 'curriculum_navigation_content', 'curriculum',
      'formatted-content', 'savanna-styles', 'imagebase'
    ],
    moderateKeywords: ['config', 'configuration', 'defaults', 'lesson', 'assets', 'img', 'btn', 'dropdown'],
    citation: 'Lesson content (assets/learning-companion/lesson-content.js)',
    source_url: '/pages/concept-with-navigation.html',
    tutorExplanation: `The Savanna configuration sets the default CSS selectors used to locate and scope the lesson within the page.

Key settings include:
- **Lesson selector (\`#curriculum_navigation_content\`):** Targets the main container where the current lesson activity lives.
- **Title selector (\`h1\`):** Identifies the primary heading that names the lesson.
- **Body selectors (\`.formatted-content, .savanna-styles\`):** Pinpoints the specific containers with the authored lesson text.
- **Image base (\`/assets/img/\`):** Sets the base directory for local course illustrations.
- **Exclude selector (\`.btn, .progress, .dropdown-menu\`):** Ensures interactive buttons and progress indicators inside the body are skipped.

💡 **Helpful Analogy:** These selectors act like a map coordinate system, telling the companion exactly which room in the digital school contains the lesson material!`,
    amharicExplanation: `የሳቫና (Savanna) የመማሪያ ስርዓት ነባሪ ቅንብሮች የትምህርቱን ይዘት በትክክል ለማግኘት የሚያገለግሉ መለያዎች ናቸው፦

- **የትምህርት መያዣ (#curriculum_navigation_content)፦** ንቁው የትምህርት እንቅስቃሴ የሚገኝበትን ዋና ክፍል ይወስናል።
- **የርዕስ መለያ (h1)፦** የትምህርቱን ስም የያዘውን ዋና ርዕስ ይለያል።
- **የትምህርት አካል (.formatted-content, .savanna-styles)፦** ትምህርቱ የተጻፈበትን ትክክለኛ የይዘት ሳጥን ይጠቁማል።
- **የምስል አድራሻ (/assets/img/)፦** ለኮርሱ የሚያስፈልጉ ምስሎች የሚገኙበትን አቃፊ ይወስናል።
- **የማይካተቱ ክፍሎች (.btn, .progress, .dropdown-menu)፦** በይዘቱ ውስጥ ያሉ የተግባር አዝራሮች እና የሂደት ጠቋሚዎች እንዳይካተቱ ያደርጋል።

💡 **ምሳሌ (Analogy)፦** እነዚህ መለያዎች ልክ እንደ ካርታ አቅጣጫ ጠቋሚ በመሆን በትልቁ የትምህርት ቤት ህንፃ ውስጥ ትክክለኛው የመማሪያ ክፍል የት እንዳለ ያሳያሉ!`,
  },
  {
    id: 'host_configuration',
    title: 'Custom Host Configuration (hostFor)',
    strongKeywords: [
      'hostfor', 'lesson-selector', 'title-selector', 'content-selector',
      'image-base', 'exclude-selector'
    ],
    moderateKeywords: [
      'host', 'custom', 'attributes', 'attribute', 'embed', 'embedding', 'override',
      'config', 'configuration', 'configure', 'options'
    ],
    citation: 'Lesson content (assets/learning-companion/lesson-content.js)',
    source_url: '/pages/concept-with-navigation.html',
    tutorExplanation: `The \`hostFor\` function allows third-party learning platforms to customize how the Inklu companion finds lesson material.

It reads these custom attributes directly from the companion element:
- **\`lesson-selector\`:** Specifies a custom container selector instead of the Savanna default.
- **\`title-selector\`:** Customizes where to find the lesson title.
- **\`content-selector\`:** Defines custom content classes or IDs for the lesson body.
- **\`image-base\`:** Sets a custom image path for course assets.
- **\`exclude-selector\`:** Specifies platform-specific classes or elements that should be omitted.

💡 **Helpful Analogy:** It is like an adapter plug that allows the Inklu companion to connect seamlessly into any learning management system, not just Savanna!`,
    amharicExplanation: `የአስተናጋጅ ቅንብር (hostFor) ሌሎች የትምህርት መድረኮች የInklu ረዳትን ከራሳቸው ስርዓት ጋር እንዲያገናኙ ያስችላል፦

- **የትምህርት መራጭ (lesson-selector)፦** የትምህርቱን መያዣ ሳጥን እንደፈለጉ ለመቀየር ያገለግላል።
- **የርዕስ መራጭ (title-selector)፦** የትምህርቱን ርዕስ ከየትኛው ክፍል ማግኘት እንደሚቻል ይወስናል።
- **የይዘት መራጭ (content-selector)፦** ለትምህርቱ ጽሑፍ ብጁ ክፍሎችን ለመለየት ያስችላል።
- **የምስል መነሻ (image-base)፦** ለኮርሱ ምስሎች የተለየ አቃፊ ለመመደብ ያገለግላል።
- **የማግለያ መራጭ (exclude-selector)፦** በመድረኩ ላይ የማይፈለጉ ክፍሎችን ለማስወገድ ያስችላል።

💡 **ምሳሌ (Analogy)፦** ይህ ልክ ማንኛውንም የኤሌክትሪክ ዕቃ ከተለያዩ ሶኬቶች ጋር ለማገናኘት የሚያስችል ሁለንተናዊ አስማሚ (Universal Adapter) እንደመጠቀም ነው!`,
  },
  {
    id: 'find_lesson',
    title: 'Locating the Lesson Element (findLesson)',
    strongKeywords: ['findlesson', 'closest', 'queryselector'],
    moderateKeywords: ['find', 'locate', 'element', 'container', 'invalid', 'fallback', 'safety'],
    citation: 'Lesson content (assets/learning-companion/lesson-content.js)',
    source_url: '/pages/concept-with-navigation.html',
    tutorExplanation: `The \`findLesson\` function safely locates the active lesson element on the page.

How it works:
- **Proximity check:** It first looks upwards using \`element.closest(host.lesson)\` to see if the companion is inside the lesson container.
- **Document query:** If not found inside, it queries the owner document with \`querySelector(host.lesson)\`.
- **Strict safety guardrail:** If the selector is invalid or no element matches, it returns \`null\` instead of falling back to the entire page, preventing sensitive page chrome from being misread.

💡 **Helpful Analogy:** It's like checking your own backpack first for your textbook, and if it's not there, looking on your assigned desk—never rummaging through someone else's locker!`,
    amharicExplanation: `የትምህርት መፈለጊያ ተግባር (findLesson) በገጹ ላይ ያለውን ንቁ የትምህርት ክፍል በጥንቃቄ ለማግኘት ያገለግላል፦

- **የቅርበት ፍተሻ፦** ረዳቱ ራሱ በትምህርት መያዣ ሳጥን ውስጥ መገኘቱን በቅርበት ይፈትሻል።
- **የገጽ ፍተሻ፦** በውስጡ ካልተገኘ በመላው ገጽ ላይ ትክክለኛውን የትምህርት ክፍል ፈልጎ ያገኛል።
- **የደህንነት ጥበቃ፦** ትክክለኛ ክፍል ካልተገኘ ባዶ (null) ይመልሳል እንጂ አላስፈላጊ የገጽ ክፍሎችን አይወስድም።

💡 **ምሳሌ (Analogy)፦** ይህ ልክ የመማሪያ መጽሐፍዎን በቅድሚያ በገዛ ቦርሳዎ ውስጥ መፈለግ፣ ከዚያም በክፍልዎ ጠረጴዛ ላይ ማየት እንጂ የሌላ ሰውን ሳጥን አለመክፈት ነው!`,
  },
  {
    id: 'visibility_checks',
    title: 'Visibility and Exclusion Checks (isExcluded and isAvailable)',
    strongKeywords: [
      'isexcluded', 'isavailable', 'computedstyle', 'getcomputedstyle',
      'ancestor', 'ancestors'
    ],
    moderateKeywords: ['visibility', 'visible', 'hidden', 'display', 'none', 'collapse', 'check', 'detect', 'computed', 'style'],
    citation: 'Lesson content (assets/learning-companion/lesson-content.js)',
    source_url: '/pages/concept-with-navigation.html',
    tutorExplanation: `Inklu uses two coordinating functions—\`isExcluded\` and \`isAvailable\`—to make sure hidden or restricted elements are never included.

Here is how they work together:
- **\`isExcluded\`:** Checks if a single element matches exclusion selectors, or has CSS styles like \`display: none\`, \`visibility: hidden\`, or \`visibility: collapse\`.
- **\`isAvailable\`:** Climbs all the way up the DOM tree through every ancestor of an element. If *any* parent or ancestor is excluded or hidden, the element is deemed unavailable.

💡 **Helpful Analogy:** Imagine you're checking whether a room is open: even if the door inside is unlocked, if the building's front gate is locked, you can't enter!`,
    amharicExplanation: `የእይታ እና የማግለያ ፍተሻዎች (isExcluded እና isAvailable) የተደበቁ ክፍሎች እንዳይካተቱ በጋራ ይሰራሉ፦

- **የተናጠል ፍተሻ (isExcluded)፦** አንድ ክፍል በቅጡ መደበቁን (display: none ወይም visibility: hidden) ያጣራል።
- **የቤተሰብ ፍተሻ (isAvailable)፦** የአንድን ክፍል መላው ወላጅ አባላት ይመረምራል፤ አንዱ እንኳን ከተደበቀ ሙሉው ክፍል አይካተትም።

💡 **ምሳሌ (Analogy)፦** የክፍሉ በር ክፍት ቢሆንም እንኳ የውጭው የህንጻው ዋና በር ከተዘጋ ወደ ክፍሉ መግባት እንደማይቻል ሁሉ፣ ወላጅ አካሉ ከተደበቀ ልጁም አይታይም!`,
  },
  {
    id: 'copy_content',
    title: 'Copying Reading Content (copyContent)',
    strongKeywords: [
      'copycontent', 'documentfragment', 'detached', 'inert', 'text_node'
    ],
    moderateKeywords: [
      'copy', 'fragment', 'text', 'images', 'alt', 'aria-label', 'missing',
      'description', 'ordered', 'start', 'reversed', 'value', 'lang'
    ],
    citation: 'Lesson content (assets/learning-companion/lesson-content.js)',
    source_url: '/pages/concept-with-navigation.html',
    tutorExplanation: `The \`copyContent\` function is the engine that extracts lesson reading into a clean, detached document fragment.

Key capabilities:
- **Detached & inert:** It builds a separate \`DocumentFragment\`, meaning reading content can be transformed without altering the live website.
- **Image descriptions:** For each image, it extracts the \`aria-label\` or \`alt\` text into an inline description (\`Image description: ...\`). If an image lacks alternative text, it marks it as \`[Image without alt text]\` so visually impaired learners are informed.
- **List preservation:** It captures ordered list attributes including start numbers (\`start\`), reverse ordering (\`reversed\`), and specific item numbers (\`value\`).
- **Language support:** Preserves language tags (\`lang\`) so screen readers and translation tools pronounce words accurately.

💡 **Helpful Analogy:** Think of \`copyContent\` as a polite scholar copying important notes into a clean study journal, making sure to note figure descriptions and language markers accurately!`,
    amharicExplanation: `የይዘት ቅጂ ተግባር (copyContent) የትምህርቱን ጽሑፍ ንጹህ በሆነ የተለየ ክፍል ውስጥ አዘጋጅቶ ያቀርባል፦

- **ገለልተኛ ዝግጅት፦** ዋናውን ድረ-ገጽ ሳይቀይር ትምህርቱን ለንባብ በሚያመች መንገድ ለይቶ ያዘጋጃል።
- **የምስል ማብራሪያ፦** ለእያንዳንዱ ምስል ገላጭ ጽሑፍ ያዘጋጃል፤ ማብራሪያ ለሌላቸው ምስሎችም ጠቋሚ ማስታወሻ ይሰጣል።
- **የዝርዝር አደረጃጀት፦** የቁጥር ቅደም ተከተሎችን እና የነጥብ ዝርዝሮችን እንዳሉ ይጠብቃል።
- **የቋንቋ ምልክቶች፦** የስክሪን አንባቢዎች ቃላትን በትክክል እንዲያነቡ የቋንቋ መለያዎችን ይጠብቃል።

💡 **ምሳሌ (Analogy)፦** ይህ ልክ አንድ ትጉህ ተማሪ ከመምህሩ ማስታወሻ ላይ ጠቃሚ ነጥቦችንና የምስል ማብራሪያዎችን በራሱ ንጹህ ደብተር ላይ በጥንቃቄ እንደመገልበጥ ነው!`,
  },
  {
    id: 'extract_lesson',
    title: 'Complete Lesson Extraction (extractLesson)',
    strongKeywords: ['extractlesson', 'extraction'],
    moderateKeywords: ['extract', 'title', 'content', 'visuals', 'context', 'heading', 'nearby', 'caption', 'bundles', 'output'],
    citation: 'Lesson content (assets/learning-companion/lesson-content.js)',
    source_url: '/pages/concept-with-navigation.html',
    tutorExplanation: `The \`extractLesson\` function orchestrates the full extraction pipeline for a lesson.

What it delivers:
- **\`title\`:** The clean text of the main lesson heading.
- **\`content\`:** A detached DocumentFragment containing all filtered, readable body material.
- **\`images\`:** A list of image descriptions and alt text found in the lesson.
- **\`visuals\`:** A curated list of local image assets paired with up to 1200 characters of surrounding context (lesson title, nearby headings, captions, and text) to enable high-quality AI visual descriptions.

💡 **Helpful Analogy:** It is like compiling a comprehensive study packet that neatly bundles the chapter title, the main reading passage, and image study guides into one organized folder!`,
    amharicExplanation: `የትምህርት ማውጣት ተግባር (extractLesson) ሙሉውን የትምህርት ማዘጋጀት ሂደት የሚያስተባብር ዋና ተግባር ነው፦

- **የትምህርት ርዕስ (title)፦** የትምህርቱን ዋና ርዕስ በንጽሕና ለይቶ ያወጣል።
- **የትምህርት ይዘት (content)፦** የተጣራና የተስተካከለ የንባብ ጽሑፍን ያቀርባል።
- **የምስሎች ዝርዝር (images)፦** በትምህርቱ ውስጥ ያሉትን ምስሎች መግለጫ ያዘጋጃል።
- **የዕይታ ማብራሪያዎች (visuals)፦** ለምስሎቹ በቂ የትምህርት አውድ በመስጠት በሰው ሰራሽ አስተውሎት (AI) ምስሎችን በዝርዝር ለማስረዳት ያስችላል።

💡 **ምሳሌ (Analogy)፦** ይህ ልክ የትምህርቱን ርዕስ፣ ዋና ንባብ እና የምስል ማብራሪያዎችን በአንድ የተሟላ የጥናት አቃፊ ውስጥ አደራጅቶ እንደማቅረብ ነው!`,
  },
  {
    id: 'va_industry_future',
    title: 'The Future of the Virtual Assistant (VA) Industry',
    strongKeywords: ['shaping', 'future', 'va', 'industry', 'remote-first', 'virtual assistant', 'work'],
    moderateKeywords: [
      'virtual', 'assistant', 'remote', 'businesses', 'flexibility', 'specialized',
      'skills', 'distributed', 'teams'
    ],
    citation: 'Lesson content (assets/learning-companion/lesson-content.js)',
    source_url: '/pages/concept-with-navigation.html',
    tutorExplanation: `The Virtual Assistant (VA) industry is rapidly evolving rather than shrinking!

Key forces shaping the future of VA work:
- **More remote-first businesses:** Companies are comfortable building distributed teams across time zones, making remote administrative and specialized roles permanent and scalable.
- **Demand for flexibility:** Businesses often prefer flexible, on-demand support rather than hiring full-time in-office staff for every individual task.
- **Shift toward specialized skills:** VAs are expanding from basic administrative duties into specialized areas like social media management, project coordination, and AI tool operations.
- **Human + AI collaboration:** Modern VAs leverage AI and digital tools to automate repetitive work, focusing more of their time on critical thinking, client communication, and problem-solving.

💡 **Helpful Analogy:** Just like accountants evolved from paper ledgers to spreadsheets and financial software, modern VAs use digital tools to become essential strategic partners!`,
    amharicExplanation: `የቨርቹዋል አሲስታንት የስራ ዘርፍ ወደፊት በፍጥነት እያደገና እየተለወጠ የሚገኝ መስክ ነው፦

- **የርቀት ስራ መስፋፋት፦** በርካታ አለም አቀፍ ድርጅቶች በየቦታው የተበተኑ ሰራተኞችን ማስተባበር በመጀመራቸው፣ የቨርቹዋል አሲስታንት ስራ ቋሚ እና አስተማማኝ የስራ እድል እየሆነ መጥቷል።
- **የተለዋዋጭ አሰራር ፍላጎት፦** ድርጅቶች ለእያንዳንዱ ስራ ቋሚ የቢሮ ሰራተኛ ከመቅጠር ይልቅ እንደ አስፈላጊነቱ በኦንላይን የሚሰሩ ብቁ ባለሙያዎችን መቅጠር ይመርጣሉ።
- **ልዩ ሙያዊ ክህሎቶች፦** የቨርቹዋል አሲስታንት ስራ ከመደበኛ የቢሮ አስተዳደር ባለፈ የማህበራዊ ሚዲያ አስተዳደር፣ የፕሮጀክት ማስተባበር እና የቴክኖሎጂ አጠቃቀምን እያካተተ ነው።
- **የሰው እና የቴክኖሎጂ ቅንጅት፦** ዘመናዊ ቨርቹዋል አሲስታንቶች ተደጋጋሚ ስራዎችን በቴክኖሎጂ በማገዝ ጊዜያቸውን ለደንበኞች ግንኙነት፣ ጥልቅ አስተሳሰብ እና ችግር ፈቺ ስራዎች ላይ ያውላሉ።

💡 **ምሳሌ (Analogy)፦** ልክ የሂሳብ ባለሙያዎች ከወረቀት ደብተር ወደ ኮምፒውተር ሶፍትዌር እንደተሸጋገሩ ሁሉ፣ ቨርቹዋል አሲስታንቶችም በዲጂታል ቴክኖሎጂ ታግዘው ለድርጅቶች አስፈላጊ አጋር ሆነዋል!`,
  },
];

// Helper to extract clean text blocks from concept-with-navigation.html
async function getConceptHtmlChunks() {
  try {
    const html = await readFile(conceptHtmlPath, 'utf8');
    const startIdx = html.indexOf('id="curriculum_navigation_content"');
    if (startIdx === -1) return [];

    const slice = html.slice(startIdx);
    let cleaned = slice
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<(nav|footer|button|form)\b[^<]*(?:(?!<\/\1>)<[^<]*)*<\/\1>/gi, '')
      .replace(/<alx-learning-companion\b[^<]*(?:(?!<\/alx-learning-companion>)<[^<]*)*<\/alx-learning-companion>/gi, '');

    const regex = /<(h[1-6]|p|li|blockquote|figcaption)\b[^>]*>([\s\S]*?)<\/\1>/gi;
    const blocks = [];
    let m;
    let lastHeading = '';
    while ((m = regex.exec(cleaned)) !== null) {
      const tag = m[1].toLowerCase();
      const text = m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      if (!text) continue;
      if (tag.startsWith('h')) {
        lastHeading = text;
      } else if (text.length > 30) {
        const fullText = lastHeading ? `${lastHeading}: ${text}` : text;
        blocks.push({
          tag,
          text: fullText,
          citation: 'Lesson content (pages/concept-with-navigation.html)',
          source_url: '/pages/concept-with-navigation.html'
        });
      }
    }
    return blocks;
  } catch {
    return [];
  }
}

// Ingest jobs data from jobs-data.json or jobs-data.js
async function loadJobsData() {
  for (const path of [backendJobsPath, assetsJobsPath]) {
    try {
      const raw = await readFile(path, 'utf8');
      const data = JSON.parse(raw);
      if (Array.isArray(data) && data.length) {
        return data;
      }
    } catch {
      // Continue to next path
    }
  }
  if (Array.isArray(jobsData) && jobsData.length) {
    return jobsData;
  }
  return [];
}

// Ingest offline FAQ data from offline-faq.json
async function loadOfflineFaqData() {
  for (const path of [backendFaqPath, assetsFaqPath]) {
    try {
      const raw = await readFile(path, 'utf8');
      const data = JSON.parse(raw);
      if (Array.isArray(data) && data.length) {
        return data;
      }
    } catch {
      // Continue to next path
    }
  }
  return [];
}

// Extract dynamic chunks from the actual lesson-content.js file on disk
async function loadDynamicLessonContent() {
  let rawContent = '';
  try {
    rawContent = await readFile(lessonPath, 'utf8');
  } catch {
    return [];
  }

  const chunks = [];

  // Extract comments
  const commentRegex = /\/\/(.*)$|\/\*([\s\S]*?)\*\//gm;
  let cm;
  while ((cm = commentRegex.exec(rawContent)) !== null) {
    const text = (cm[1] || cm[2] || '').trim();
    if (text.length > 20 && !text.includes('eslint') && !text.includes('istanbul')) {
      chunks.push({
        id: `comment_${chunks.length}`,
        title: 'Lesson Content Note',
        text,
        strongKeywords: tokenize(text).filter(w => !GENERIC_WORDS.has(w)),
        moderateKeywords: tokenize(text),
        citation: 'Lesson content (assets/learning-companion/lesson-content.js)',
        source_url: '/pages/concept-with-navigation.html',
        isDynamic: true,
      });
    }
  }

  // Extract paragraphs if file contains natural language lines
  const lines = rawContent.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const plainParagraphs = [];
  let currentPara = [];
  for (const line of lines) {
    if (!line.startsWith('import ') && !line.startsWith('export ') && !line.startsWith('const ') &&
        !line.startsWith('let ') && !line.startsWith('var ') && !line.startsWith('function ') &&
        !line.endsWith('{') && !line.endsWith('};')) {
      currentPara.push(line);
    } else if (currentPara.length) {
      plainParagraphs.push(currentPara.join(' '));
      currentPara = [];
    }
  }
  if (currentPara.length) plainParagraphs.push(currentPara.join(' '));

  for (const para of plainParagraphs) {
    if (para.length > 30) {
      chunks.push({
        id: `text_${chunks.length}`,
        title: 'Lesson Material Excerpt',
        text: para,
        strongKeywords: tokenize(para).filter(w => !GENERIC_WORDS.has(w)),
        moderateKeywords: tokenize(para),
        citation: 'Lesson content (assets/learning-companion/lesson-content.js)',
        source_url: '/pages/concept-with-navigation.html',
        isDynamic: true,
      });
    }
  }

  return chunks;
}

// Convert job records into searchable RAG chunks
function jobToChunk(job) {
  const isAccommodation = job.id?.includes('accommodation') || job.title?.toLowerCase().includes('accommodation');
  const skillsList = Array.isArray(job.key_skills) ? job.key_skills.map(s => `- ${s}`).join('\n') : '';

  let explanation;
  if (isAccommodation) {
    explanation = `Here are the details regarding **${job.title}**:

- **Policy Overview:** ${job.description}
- **Available Accommodations:**
${skillsList}
- **Program & Support:** ${job.company} (${job.location})

💡 **Helpful Analogy:** Think of interview accommodations like a wheelchair ramp at an entrance—it doesn't change the destination or standards, but ensures every candidate has an equal, unobstructed pathway to demonstrate their skills!`;
  } else {
    explanation = `Here are the details for the **${job.title}** opening at **${job.company}**:

- **Role Overview:** ${job.description}
- **Company & Location:** ${job.company} (${job.location})
- **Employment Type & Pay:** ${job.type} (${job.salary_range || 'Competitive'})
- **Key Required Skills:**
${skillsList}

💡 **Helpful Analogy (Career Tip):** Approaching this role is like being an indispensable digital co-pilot—you keep communication, schedules, and operations running smoothly from anywhere!`;
  }

  return {
    id: job.id,
    title: job.title,
    text: explanation,
    strongKeywords: [
      'job', 'jobs', 'career', 'careers', 'hiring', 'vacancy', 'vacancies', 'salary',
      ...(job.keywords || []),
      ...tokenize(job.title),
      ...tokenize(job.company)
    ],
    moderateKeywords: [
      'remote', 'role', 'roles', 'skills', 'apply', 'application', 'company', 'accommodations', 'accommodation',
      ...tokenize(job.description)
    ],
    citation: job.citation || `Job Opportunities (jobs-data.json - ${job.title})`,
    source_url: job.source_url || '/pages/homepage-v1-paced.html#careers',
    isJob: true,
    company: job.company,
    location: job.location,
    jobType: job.type,
    salary: job.salary_range,
    skills: job.key_skills,
    overview: job.description,
    tutorExplanation: explanation
  };
}

// Flexible semantic and fuzzy scoring function
function scoreCandidates(candidates, query) {
  const queryTokens = tokenize(query);
  if (!queryTokens.length) {
    return { match: null, score: 0 };
  }

  let bestCandidate = null;
  let bestScore = 0;
  const normalizedQuery = query.toLowerCase();

  for (const candidate of candidates) {
    let score = 0;
    let strongMatches = 0;
    let totalMatchedTokens = 0;

    const strongKws = candidate.strongKeywords || [];
    const modKws = candidate.moderateKeywords || [];
    const candidateText = (candidate.text || '').toLowerCase();
    const candidateTitle = (candidate.title || '').toLowerCase();

    for (const qToken of queryTokens) {
      let tokenMatched = false;

      // Check strong keywords first
      for (const sk of strongKws) {
        const m = matchWord(qToken, sk);
        if (m) {
          score += 12 * m.weight;
          strongMatches++;
          tokenMatched = true;
          break;
        }
      }

      // If not strong, check moderate keywords
      if (!tokenMatched) {
        for (const mk of modKws) {
          const m = matchWord(qToken, mk);
          if (m) {
            const genPenalty = GENERIC_WORDS.has(qToken) ? 0.4 : 1.0;
            score += 7 * m.weight * genPenalty;
            tokenMatched = true;
            break;
          }
        }
      }

      // Check title or text directly
      if (!tokenMatched) {
        if (candidateTitle.includes(qToken)) {
          score += 6;
          tokenMatched = true;
        } else if (candidateText.includes(qToken) && !GENERIC_WORDS.has(qToken)) {
          score += 3;
          tokenMatched = true;
        }
      }

      if (tokenMatched) totalMatchedTokens++;
    }

    // Phrase / bigram match bonus
    for (let i = 0; i < queryTokens.length - 1; i++) {
      const bigram = `${queryTokens[i]} ${queryTokens[i + 1]}`;
      if (candidateText.includes(bigram) || candidateTitle.includes(bigram)) {
        score += 15;
        strongMatches++;
      }
    }

    // Exact phrase in text
    if (normalizedQuery.length >= 8 && candidateText.includes(normalizedQuery)) {
      score += 25;
      strongMatches++;
    }

    // Strict domain groundedness checks
    if (strongMatches === 0 && queryTokens.every(q => GENERIC_WORDS.has(q) || !modKws.includes(q))) {
      continue;
    }

    const coverage = totalMatchedTokens / queryTokens.length;
    if (coverage < 0.35 && queryTokens.length > 2) {
      continue;
    }

    if (strongMatches === 0 && coverage < 0.6) {
      continue;
    }

    // Prefer rich grounded tutor explanations when available
    if (candidate.isBuiltin && totalMatchedTokens > 0) {
      score += 6;
    }

    const finalScore = score * (0.3 + 0.7 * coverage);
    if (finalScore > bestScore) {
      bestScore = finalScore;
      bestCandidate = candidate;
    }
  }

  const MIN_SCORE_THRESHOLD = 8.0;
  if (!bestCandidate || bestScore < MIN_SCORE_THRESHOLD) {
    return { match: null, score: 0 };
  }

  return { match: bestCandidate, score: bestScore };
}

// Formats arbitrary dynamic text into a warm, friendly tutor explanation
function formatDynamicTutorAnswer(chunk, query) {
  if (chunk.tutorExplanation) {
    return chunk.tutorExplanation;
  }

  const raw = chunk.text.trim();
  const sentences = raw
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(Boolean);

  let intro = `Here is how this concept is explained in our materials:`;
  let bullets = sentences.slice(0, 4).map(s => `- ${s}`).join('\n');
  if (!bullets) bullets = `- ${raw}`;

  return `${intro}

${bullets}

💡 **Key Takeaway:** Connect these concepts directly back to your learning materials to reinforce your understanding!`;
}

function cleanSnippet(text, maxLength = 260) {
  if (typeof text !== 'string') return '';
  const clean = text
    .replace(/^#+\s+/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/💡/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (clean.length <= maxLength) return clean;
  return clean.slice(0, maxLength).trim() + '…';
}

function amharicJobTitle(title) {
  const t = (title || '').toLowerCase();
  if (t.includes('interview accommodation')) return 'የቃለ-መጠይቅ ተደራሽነት እና ማመቻቸት (Interview Accommodations)';
  if (t.includes('available job')) return 'ክፍት የስራ እድሎች (Available Jobs)';
  if (t.includes('executive virtual assistant')) return 'ከፍተኛ የቨርቹዋል አሲስታንት (Executive Virtual Assistant)';
  if (t.includes('social media')) return 'የማህበራዊ ሚዲያ አስተባባሪ (Social Media Coordinator)';
  if (t.includes('customer support')) return 'የደንበኞች አገልግሎት ባለሙያ (Customer Support Specialist)';
  if (t.includes('technical project')) return 'የቴክኒካል ፕሮጀክት ረዳት (Technical Project Assistant)';
  if (t.includes('data entry') || t.includes('data research')) return 'የርቀት የመረጃ ማስገቢያ ባለሙያ (Remote Data Specialist)';
  if (t.includes('marketing')) return 'የዲጂታል ማርኬቲንግ ረዳት (Digital Marketing Assistant)';
  return title;
}

function amharicSkill(skill) {
  const s = (skill || '').toLowerCase();
  if (s.includes('extended time')) return 'ተጨማሪ የፈተና እና የቃለ-መጠይቅ ጊዜ (Extended Time)';
  if (s.includes('screen reader')) return 'የስክሪን አንባቢዎች እና አጋዥ ቴክኖሎጂዎች ተኳሃኝነት (Screen Readers)';
  if (s.includes('accessible')) return 'ተደራሽ የፈተና እና የቃለ-መጠይቅ ሰነዶች አቅርቦት';
  if (s.includes('google workspace')) return 'የጉግል የቢሮ ሶፍትዌሮች አጠቃቀም (Google Workspace / Docs, Sheets, Drive)';
  if (s.includes('calendar')) return 'የቀን መቁጠሪያ እና የቀጠሮ አስተዳደር (Calendar Management)';
  if (s.includes('email')) return 'ሙያዊ የኢሜይል ግንኙነት እና መልዕክቶች አያያዝ (Email Correspondence)';
  if (s.includes('travel')) return 'የጉዞ እና የበረራ ትኬት መርሐግብር ዝግጅት (Travel Booking)';
  if (s.includes('minutes') || s.includes('documentation')) return 'የስብሰባ ቃለ-ጉባኤ እና የሰነድ አያያዝ (Meeting Minutes & Documentation)';
  if (s.includes('zendesk') || s.includes('freshdesk') || s.includes('helpdesk')) return 'የደንበኞች ድጋፍ መስጫ ሶፍትዌሮች (Zendesk, Freshdesk)';
  if (s.includes('communication') || s.includes('empath')) return 'በትህትና እና በመረዳት ችግሮችን የመፍታት ክህሎት';
  if (s.includes('buffer') || s.includes('hootsuite') || s.includes('scheduling')) return 'የማህበራዊ ሚዲያ ይዘት መርሐግብር መሳሪያዎች (Buffer, Hootsuite)';
  if (s.includes('canva') || s.includes('graphic')) return 'ቀለል ያሉ የግራፊክስ ስራዎች በCanva';
  if (s.includes('jira') || s.includes('trello') || s.includes('asana')) return 'የፕሮጀክት መከታተያ ሶፍትዌሮች (Trello, Asana, Jira)';
  if (s.includes('excel') || s.includes('spreadsheet')) return 'የኤክሴል እና የመረጃ ሰንጠረዥ አያያዝ';
  return skill;
}

function amharicJobDescription(overview, id) {
  const o = (overview || '').toLowerCase();
  if (o.includes('accommodation') || id?.includes('accommodation')) {
    return 'ለአካል ጉዳተኞች እና ልዩ ፍላጎት ላላቸው አመልካቾች ተጨማሪ የፈተና ጊዜ እና የስክሪን አንባቢ (Screen Reader) ድጋፍን ጨምሮ የተሟላ የቃለ-መጠይቅ ማመቻቸት ይሰጣል።';
  }
  if (o.includes('available') || id?.includes('available')) {
    return 'የርቀት ቨርቹዋል አሲስታንት (Virtual Assistant) የስራ እድሎችን ጨምሮ በርካታ ክፍት የስራ መደቦች ይገኛሉ።';
  }
  if (o.includes('executive') || id?.includes('executive')) {
    return 'ለከፍተኛ የስራ ኃላፊዎች አስተዳደራዊ ድጋፍ መስጠት፣ የቀን መቁጠሪያ እና የቀጠሮ መርሐግብር ማስተካከል፣ ጉዞዎችን ማቀድ እና የኢሜይል ግንኙነቶችን በብቃት ማስተዳደር።';
  }
  if (o.includes('social media') || id?.includes('social')) {
    return 'የማህበራዊ ሚዲያ ገጾችን ማስተዳደር፣ ሳቢ የይዘት መርሐግብሮችን ማዘጋጀት፣ ከደንበኞች ለሚመጡ አስተያየቶች ምላሽ መስጠት እና የገጽ ተደራሽነትን መከታተል።';
  }
  if (o.includes('customer') || id?.includes('support')) {
    return 'ለደንበኞች ጥያቄዎች እና ችግሮች በኢሜይል እና በቀጥታ መልዕክት ፈጣንና ሙያዊ ምላሽ መስጠት፣ የትዕዛዝ ሁኔታዎችን መከታተል እና እርካታቸውን ማረጋገጥ።';
  }
  if (o.includes('technical') || id?.includes('tech')) {
    return 'የቴክኒክ እና የሶፍትዌር ፕሮጀክቶች በሰዓቱ እንዲጠናቀቁ ማስተባበር፣ ሰነዶችን ማዘጋጀት እና የቡድን አባላት ግንኙነትን ማመቻቸት።';
  }
  if (o.includes('data entry') || id?.includes('data')) {
    return 'መረጃዎችን በትክክልና በጥንቃቄ ወደ ዳታቤዝ ማስገባት፣ ስህተቶችን ማረም እና የሰነዶችን ንጽሕና መጠበቅ።';
  }
  return overview || 'የርቀት የስራ እድል መረጃ';
}

export function translateEnglishTextToAmharic(text) {
  if (!text) return '';
  let res = text;
  const replacements = [
    [/The future of the Virtual Assistant \(VA\) industry/gi, 'የቨርቹዋል አሲስታንት (VA) የስራ ዘርፍ የወደፊት ሁኔታ'],
    [/The Virtual Assistant profession is not shrinking\. It is evolving\./gi, 'የቨርቹዋል አሲስታንት ሙያ እያሽቆለቆለ አይደለም። ይልቁንም እየተለወጠ እና እያደገ ነው።'],
    [/The Virtual Assistant \(VA\) industry is rapidly evolving rather than shrinking/gi, 'የቨርቹዋል አሲስታንት (VA) የስራ ዘርፍ እየቀነሰ ከመሄድ ይልቅ በፍጥነት እያደገ ይገኛል'],
    [/Virtual Assistant/gi, 'ቨርቹዋል አሲስታንት'],
    [/is rapidly evolving rather than shrinking/gi, 'እየቀነሰ ከመሄድ ይልቅ በፍጥነት እያደገ ይገኛል'],
    [/Key forces shaping the future of VA work/gi, 'የወደፊቱን የቨርቹዋል አሲስታንት ስራ የሚቀርጹ ዋና ዋና ሁኔታዎች'],
    [/More remote-first businesses/gi, 'የርቀት ስራን ቅድሚያ የሚሰጡ ድርጅቶች መበራከት'],
    [/Demand for flexibility/gi, 'የተለዋዋጭ አሰራር ፍላጎት መጨመር'],
    [/Shift toward specialized skills/gi, 'ወደ ልዩ ሙያዊ ክህሎቶች ማዘንበል'],
    [/Human \+ AI collaboration/gi, 'የሰው እና የሰው ሰራሽ አስተውሎት (AI) ቅንጅት'],
    [/Companies are comfortable building distributed teams/gi, 'ድርጅቶች በየቦታው የተበተኑ ቡድኖችን ለመገንባት ምቹ ሆነዋል'],
    [/across time zones/gi, 'በተለያዩ የሰዓት ቀጠናዎች ውስጥ'],
    [/administrative and specialized roles/gi, 'የአስተዳደር እና ልዩ የስራ ሚናዎች'],
    [/permanent and scalable/gi, 'ቋሚ እና ሊያድጉ የሚችሉ'],
    [/on-demand support/gi, 'እንደ አስፈላጊነቱ የሚሰጥ ድጋፍ'],
    [/hiring full-time in-office staff/gi, 'ሙሉ ጊዜ የቢሮ ሰራተኛ ከመቅጠር'],
    [/social media management/gi, 'የማህበራዊ ሚዲያ አስተዳደር'],
    [/project coordination/gi, 'የፕሮጀክት ማስተባበር'],
    [/automate repetitive work/gi, 'ተደጋጋሚ ስራዎችን በራስ-ሰር ማከናወን'],
    [/critical thinking/gi, 'ጥልቅ ሂሳዊ አስተሳሰብ'],
    [/client communication/gi, 'ከደንበኞች ጋር የሚደረግ ግንኙነት'],
    [/problem-solving/gi, 'ችግሮችን መፍታት'],
    [/Reader Mode/gi, 'የንባብ ሁነታ (Reader Mode)'],
    [/navigation menus/gi, 'የአሰሳ አሞሌዎች'],
    [/form buttons/gi, 'የቅጽ አዝራሮች'],
    [/excluded elements/gi, 'የተገለሉ ወይም የማይካተቱ ክፍሎች'],
    [/retained elements/gi, 'ተጠብቀው የሚቀሩ ክፍሎች'],
    [/lesson extraction/gi, 'የትምህርት ይዘት ማውጣት'],
    [/Course Lesson Concept/gi, 'የትምህርት ፅንሰ ሀሳብ'],
    [/Lesson Content Note/gi, 'የትምህርት ይዘት ማስታወሻ'],
    [/headings/gi, 'አርዕስቶች'],
    [/paragraphs/gi, 'አንቀጾች'],
    [/lists/gi, 'ዝርዝሮች'],
    [/images/gi, 'ምስሎች'],
    [/title/gi, 'ርዕስ'],
    [/content/gi, 'ይዘት'],
  ];

  for (const [pattern, amharic] of replacements) {
    res = res.replace(pattern, amharic);
  }
  return res;
}

// Formats tutor answers in Amharic with bullet points and friendly real-world analogies
export function formatAmharicTutorAnswer(match, query) {
  if (match.amharicExplanation) {
    return match.amharicExplanation;
  }

  if (match.isJob) {
    const isAccommodation = match.id?.includes('accommodation') || match.title?.toLowerCase().includes('accommodation');
    if (isAccommodation) {
      const skillsList = Array.isArray(match.skills) && match.skills.length > 0
        ? match.skills.map(s => `- ${amharicSkill(s)}`).join('\n')
        : '- ተጨማሪ የፈተና እና የቃለ-መጠይቅ ጊዜ\n- የስክሪን አንባቢዎች (Screen Readers) ተኳሃኝነት';

      return `ስለ **${match.title}** (የቃለ-መጠይቅ ማመቻቸት) መረጃ የሚከተለው ነው፦

- **የመመሪያው አጠቃላይ እይታ፦** ${amharicJobDescription(match.overview, match.id)}
- **ፕሮግራም እና ተደራሽነት፦** ${match.company || 'የተደራሽነት ፕሮግራም'} (${match.location || 'የርቀት'})
- **የሚሰጡ ዋና ዋና ማመቻቸቶች፦**
${skillsList}

💡 **ምሳሌ (Analogy)፦** ይህ ልክ ህንጻ መግቢያ ላይ ለተሽከርካሪ ወንበር ምቹ መንገድ እንደማዘጋጀት ነው—መስፈርቱን ሳይቀይር ሁሉም በእኩል ደረጃ ችሎታውን እንዲያሳይ ያግዛል!`;
    }

    const skillsList = Array.isArray(match.skills) && match.skills.length > 0
      ? match.skills.map(s => `- ${amharicSkill(s)}`).join('\n')
      : '- ጥሩ የመግባቢያ ክህሎት\n- የኮምፒውተር እና የርቀት ስራ ችሎታ';

    const amharicType = (match.jobType || '').toLowerCase().includes('part') ? 'የትርፍ ጊዜ (Part-time)' : 'ሙሉ ጊዜ (Full-time)';
    const amharicLoc = (match.location || '').toLowerCase().includes('remote') ? 'የርቀት ስራ (Remote)' : (match.location || 'የርቀት');
    const amharicSal = (match.salary || '').toLowerCase().includes('compet') ? 'ተወዳዳሪ ክፍያ (Competitive)' : (match.salary || 'ተወዳዳሪ ክፍያ');

    return `ስለ **${match.title}** የስራ እድል መረጃ የሚከተለው ነው፦

- **የስራ መደብ፦** ${amharicJobTitle(match.title)}
- **ድርጅት እና የስራ ቦታ፦** ${match.company || 'ኩባንያ'} (${amharicLoc})
- **የስራ ሁኔታ እና ክፍያ፦** ${amharicType} (${amharicSal})
- **የስራው አጠቃላይ እይታ፦** ${amharicJobDescription(match.overview, match.id)}
- **የሚያስፈልጉ ዋና ዋና ክህሎቶች፦**
${skillsList}

💡 **የስራ ምክር (Career Tip)፦** ማመልከቻዎን በነዚህ ክህሎቶች ዙሪያ በማዘጋጀት የርቀት ስራ ዝግጁነትዎን እና ጠንካራ የመግባቢያ ችሎታዎን ያሳዩ!`;
  }

  if (match.isOffline) {
    if (match.id === 'faq_offline_status') {
      return `ስለ ከመስመር ውጭ (Offline) ድጋፍ መረጃ የሚከተለው ነው፦

- **ፈጣን ምትክ፦** የኢንተርኔት ግንኙነት ቢቋረጥም አስፈላጊ መረጃዎችን እና የትምህርት ማጠቃለያዎችን ያለማቋረጥ ማግኘት ይችላሉ።
- **የተቀመጠ መረጃ፦** አስፈላጊ መመሪያዎች እና ተደጋጋሚ ጥያቄዎች በኮምፒውተርዎ ላይ ተቀምጠው ይገኛሉ።
- **ራስ-ሰር ዳግም ግንኙነት፦** ኔትወርክ ሲመለስ ስርዓቱ በራስ-ሰር ወደ ቀጥታ አገልግሎት ይመለሳል።

💡 **ምሳሌ (Analogy)፦** ይህ ልክ ኢንተርኔት በሌለበት ጊዜ በስልክዎ ላይ የተቀመጠ ማስታወሻ ደብተር እንደማንበብ ነው!`;
    }
    if (match.id === 'faq_inklu_overview') {
      return `ስለ Inklu የመማሪያ ረዳት አጠቃላይ እይታ፦

- **ቀላል ማብራሪያ (Explain Simply)፦** ውስብስብ የሆኑ ፅንሰ ሀሳቦችን ወደ ቀላል ቋንቋ ይለውጣል።
- **የትርጉም አገልግሎት (Translate)፦** ትምህርቱን ወደ አማርኛ ተርጉሞ በድምጽ ያነባል።
- **የምስል ማብራሪያ (Describe Visuals)፦** ለትምህርቱ ምስሎች እና ዲያግራሞች ገላጭ ማብራሪያ ይሰጣል።
- **የአስተማሪ ጥያቄ (Ask Tutor)፦** ስለ ትምህርቱ ለሚጠየቁ ጥያቄዎች ግልጽና አጋዥ ምላሾችን ያቀርባል።

💡 **ምሳሌ (Analogy)፦** ይህ ልክ በሚያጠኑበት ጊዜ ሁልጊዜ ከጎንዎ ሆኖ የሚያግዝ ታጋሽ የግል አስተማሪ እንዳለዎት ነው!`;
    }
    if (match.id === 'faq_va_preparation') {
      return `ለቨርቹዋል አሲስታንት (VA) የርቀት ስራ ዝግጅት የሚረዱ ነጥቦች፦

- **የዲጂታል መሳሪያዎችን መልመድ፦** የካላንደር አስተዳደር፣ Google Workspace፣ Slack እና የኢሜይል ልውውጥን ማወቅ።
- **የአስተውሎት (AI) ቴክኖሎጂን መጠቀም፦** ጽሑፎችን ለማዘጋጀት፣ ለማጠቃለል እና ስራዎችን ለማቀድ ቴክኖሎጂን መጠቀም።
- **ልዩ ሙያዎችን ማዳበር፦** የደንበኞች አገልግሎት፣ የፕሮጀክት ማስተባበር ወይም የማህበራዊ ሚዲያ ስራዎች ላይ ማተኮር።
- **ቀልጣፋ ግንኙነት፦** ወቅታዊ መረጃዎችን መስጠት፣ የሰዓት ልዩነቶችን መገንዘብ እና ጥያቄዎችን ግልጽ ማድረግ።

💡 **ምሳሌ (Analogy)፦** ይህ ልክ ለአንድ ስራ የበዛበት ነጋዴ ሁሉንም ስራዎች፣ ቀጠሮዎች እና ግንኙነቶች በትክክል እንደሚያስተባብር ረዳት መሆን ነው!`;
    }
    if (match.id === 'faq_available_jobs') {
      return `ስለ ክፍት የቨርቹዋል አሲስታንት (VA) የስራ እድሎች፦

- **የስራ ዓይነቶች፦** ከፍተኛ የቨርቹዋል አሲስታንት፣ የደንበኞች አገልግሎት እና የማህበራዊ ሚዲያ አስተባባሪ ሚናዎች ይገኛሉ።
- **የስራ ሁኔታ፦** ከየትኛውም ቦታ ሆነው በኦንላይን የሚሰሩ የርቀት ስራዎች ናቸው።
- **ተለዋዋጭ ክፍያ፦** በሙሉ ጊዜ እና በትርፍ ጊዜ አማራጮች ተወዳዳሪ ክፍያ ይሰጣሉ።

💡 **ምሳሌ (Analogy)፦** ይህ ልክ የተረጋገጡ እና ለርቀት ስራ ዝግጁ የሆኑ እድሎች የተሰበሰቡበትን ዲጂታል የስራ ማስታወቂያ ሰሌዳ እንደመመልከት ነው!`;
    }
    if (match.id === 'faq_interview_accommodations') {
      return `ስለ ቃለ-መጠይቅ ተደራሽነት እና ማመቻቸት (Interview Accommodations)፦

- **ተጨማሪ ጊዜ፦** ለፈተናዎች፣ ለቴክኒካል ምዘናዎች እና ለቃለ-መጠይቆች ተጨማሪ ጊዜ ይሰጣል።
- **የስክሪን አንባቢ ድጋፍ፦** ከNVDA፣ JAWS እና ሌሎች አጋዥ ሶፍትዌሮች ጋር ሙሉ ለሙሉ ተኳሃኝ ነው።
- **ተደራሽ ሰነዶች፦** የፈተና መመሪያዎች በተመቹ አማራጭ ቅርጾች ይዘጋጃሉ።

💡 **ምሳሌ (Analogy)፦** ይህ ልክ ህንጻ መግቢያ ላይ ለተሽከርካሪ ወንበር ምቹ መንገድ እንደማዘጋጀት ነው—መስፈርቱን ሳይቀይር ሁሉም በእኩል ደረጃ ችሎታውን እንዲያሳይ ያግዛል!`;
    }
    if (match.id === 'faq_hallucination') {
      return `Inklu የተሳሳቱ መረጃዎችን (Hallucination) እንዴት ይከላከላል?

- **በትምህርቱ ላይ ብቻ መመስረት፦** ረዳቱ ከተረጋገጠው የትምህርት ይዘት እና የስራ መረጃዎች ውጭ አይመልስም።
- **ወሰን ጠባቂነት፦** ከትምህርቱ ውጭ ለሆኑ ጥያቄዎች ከመገመት ይልቅ በትህትና ትምህርታዊ ወሰኑን ይጠቁማል።
- **የምንጭ ማጣቀሻ፦** ለእያንዳንዱ መልስ ትክክለኛውን ፋይል እና ምንጭ በግልጽ ያሳያል።

💡 **ምሳሌ (Analogy)፦** ጥሩ የቤተ-መጽሐፍት ባለሙያ ከመደርደሪያው ላይ ባሉ መጻሕፍት ላይ ተመስርቶ ብቻ እንደሚመልስ እንጂ ታሪክ እንደማይፈጥር ሁሉ!`;
    }
    return `ስለ ከመስመር ውጭ (Offline) ድጋፍ መረጃ የሚከተለው ነው፦

- **የከመስመር ውጭ ድጋፍ፦** የኢንተርኔት ግንኙነት ቢቋረጥም አስፈላጊ መረጃዎችን ከውስጣዊ ማህደር ማግኘት ይችላሉ።
- **ቀጣይ እርምጃ፦** ኔትወርክ ሲመለስ ስርዓቱ በራስ-ሰር ወደ ቀጥታ አገልግሎት ይመለሳል።

💡 **ምሳሌ (Analogy)፦** ይህ ልክ ከመስመር ውጭ ሆነው በስልክዎ ላይ የተቀመጠ ማስታወሻ ደብተር እንደማንበብ ነው!`;
  }

  const amharicTitle = translateEnglishTextToAmharic(match.title || 'የትምህርት ይዘት');
  const snippet = translateEnglishTextToAmharic(cleanSnippet(match.text || match.title, 250));
  return `በትምህርቱ ይዘት መሰረት የተብራራው ነጥብ የሚከተለው ነው፦

- **ዋና ርዕስ፦** ${amharicTitle}
- **ማብራሪያ፦** ${snippet}

💡 **ምሳሌ (Analogy)፦** ይህንን ፅንሰ ሀሳብ መረዳት የትምህርቱን ቀጣይ ክፍሎች በቀላሉ ለመገንዘብ ይረዳል!`;
}

// Creates a valid 1644-byte PCM WAV buffer (0.1s silence)
export function createFallbackAudioBuffer() {
  const sampleRate = 8000;
  const numChannels = 1;
  const bitsPerSample = 16;
  const numSamples = 800;
  const dataSize = numSamples * numChannels * (bitsPerSample / 8);
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * numChannels * (bitsPerSample / 8), 28);
  buffer.writeUInt16LE(numChannels * (bitsPerSample / 8), 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  return buffer;
}

export const tutorAudioCache = new Map();

// Cloud Text-to-Speech synthesis using the configured client (AddisAI) or fallback buffer
export async function generateTutorAudio(text, client, options = {}) {
  const isAmharic = /\p{Script=Ethiopic}/u.test(text);
  const cleanText = text
    .replace(/^#+\s+/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/💡/g, '')
    .replace(/^[-*•]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();

  const speechText = cleanText.slice(0, 400);

  if (client?.voice?.generate) {
    try {
      const voiceId = options.voiceId || 'am-hamen';
      const requestId = createHash('sha256')
        .update(JSON.stringify({ text: speechText, voiceId, language: isAmharic ? 'am' : 'en' }))
        .digest('hex')
        .slice(0, 32);

      const clip = await client.voice.generate(
        {
          text: speechText,
          voiceId,
          language: isAmharic ? 'am' : 'en',
          outputFormat: 'mp3_44100',
          clientRequestId: requestId,
        },
        { timeout: 30000 }
      );

      let audioBuffer = null;
      if (typeof clip.arrayBuffer === 'function') {
        const ab = await clip.arrayBuffer();
        audioBuffer = Buffer.from(ab);
      } else if (clip.audioUrl) {
        try {
          const resp = await fetch(clip.audioUrl);
          const ab = await resp.arrayBuffer();
          audioBuffer = Buffer.from(ab);
        } catch {
          // Keep audioUrl if direct download fails
        }
      }

      if (audioBuffer && audioBuffer.length > 0) {
        return {
          buffer: audioBuffer,
          audioUrl: clip.audioUrl || null,
          mimeType: 'audio/mpeg',
          isCloudGenerated: true,
        };
      }
      if (clip.audioUrl) {
        return {
          buffer: createFallbackAudioBuffer(),
          audioUrl: clip.audioUrl,
          mimeType: 'audio/mpeg',
          isCloudGenerated: true,
        };
      }
    } catch (err) {
      console.warn('Cloud TTS generation failed, using fallback:', err.message);
    }
  }

  const fallbackBuffer = createFallbackAudioBuffer();
  return {
    buffer: fallbackBuffer,
    audioUrl: null,
    mimeType: 'audio/wav',
    isCloudGenerated: false,
  };
}

// -------------------------------------------------------------
// Pluggable AI Service Architecture & Offline Fallback Provider
// -------------------------------------------------------------

export class PrimaryRAGProvider {
  async getCandidates() {
    const dynamicChunks = await loadDynamicLessonContent();
    const htmlBlocks = await getConceptHtmlChunks();
    const jobsData = await loadJobsData();
    const jobChunks = jobsData.map(jobToChunk);

    return [
      ...BUILTIN_LESSON_CONCEPTS.map(c => ({
        id: c.id,
        title: c.title,
        text: c.tutorExplanation,
        strongKeywords: c.strongKeywords || [],
        moderateKeywords: c.moderateKeywords || [],
        citation: c.citation,
        source_url: c.source_url,
        isBuiltin: true,
        tutorExplanation: c.tutorExplanation,
        amharicExplanation: c.amharicExplanation,
      })),
      ...dynamicChunks,
      ...htmlBlocks.map((b, idx) => ({
        id: `html_${idx}`,
        title: 'Course Lesson Concept',
        text: b.text,
        strongKeywords: tokenize(b.text).filter(w => !GENERIC_WORDS.has(w)),
        moderateKeywords: tokenize(b.text),
        citation: b.citation,
        source_url: b.source_url,
        isHtml: true,
      })),
      ...jobChunks,
    ];
  }

  async search(query) {
    const candidates = await this.getCandidates();
    return scoreCandidates(candidates, query);
  }
}

export class OfflineFAQProvider {
  async getCandidates() {
    const faqs = await loadOfflineFaqData();
    return faqs.map((faq, idx) => ({
      id: faq.id || `faq_${idx}`,
      title: faq.question || 'Available Remote Jobs and Careers',
      text: faq.answer,
      strongKeywords: [
        ...(faq.keywords || []),
        ...tokenize(faq.question)
      ],
      moderateKeywords: tokenize(faq.answer),
      citation: faq.citation || 'Offline FAQ (backend/offline-faq.json)',
      source_url: faq.source_url || '/offline-faq',
      isOffline: true,
      tutorExplanation: faq.answer
    }));
  }

  async search(query) {
    const candidates = await this.getCandidates();
    return scoreCandidates(candidates, query);
  }
}

export function detectQueryLanguage(query, fallbackLang = 'en') {
  if (typeof query !== 'string') return fallbackLang === 'am' ? 'am' : 'en';
  // If query contains Ethiopic script, the user asked in Amharic
  if (/\p{Script=Ethiopic}/u.test(query)) {
    return 'am';
  }
  // If query contains Latin letters, the user asked in English regardless of UI language
  if (/[a-zA-Z]/u.test(query)) {
    return 'en';
  }
  return fallbackLang === 'am' ? 'am' : 'en';
}

export function buildTutorSystemPrompt(queryLang = 'en') {
  const isAmharic = queryLang === 'am';
  const outOfScopeMsg = isAmharic ? AMHARIC_OUT_OF_SCOPE_FALLBACK : OUT_OF_SCOPE_FALLBACK;
  const langInstruction = isAmharic
    ? 'Language Instruction: The user asked their question in Amharic (አማርኛ). You must explicitly reply entirely in Amharic (አማርኛ).'
    : 'Language Instruction: The user asked their question in English. You must explicitly reply entirely in English.';

  return [
    'You are an expert, patient AI Tutor. I will provide you with a [CONTEXT] block of facts. You must read these facts and EXPLAIN them to the student in a conversational, easy-to-understand way. Do not just repeat the raw text. Break down the core concepts, define any jargon, and teach the material.',
    'The explanation must still include bullet points for readability and one clear, real-world analogy to help the student visualize the concept.',
    'Your explanation must be based 100% on the provided [CONTEXT]. Do not introduce outside information or hallucinate.',
    langInstruction,
    `If the question cannot be answered based 100% on the provided [CONTEXT], respond ONLY with: "${outOfScopeMsg}"`,
  ].join(' ');
}

export class PluggableAIService {
  constructor(options = {}) {
    this.primaryProvider = options.primaryProvider || new PrimaryRAGProvider();
    this.fallbackProvider = options.fallbackProvider || new OfflineFAQProvider();
  }

  async query(query, options = {}) {
    const { forceOffline = false, client = null, host = 'localhost:3000', protocol = 'http', lang = 'en' } = options;

    const queryLang = detectQueryLanguage(query, lang);
    const isAmharic = queryLang === 'am';

    // Step 1: The Translation Bridge
    // If Amharic is detected, use the LLM to translate query into English before search
    let searchQuery = query;
    let translatedQuery = null;
    if (isAmharic) {
      translatedQuery = await translateQueryToEnglish(query, client);
      searchQuery = translatedQuery;
    }

    let match = null;
    let score = 0;
    let isFallback = false;

    // Wrap primary retrieval logic in a try/catch. If primary fails or is forced offline,
    // fallback instantly to searching local offline-faq.json
    try {
      if (forceOffline) {
        throw new Error('Forced offline mode');
      }
      const primaryResult = await this.primaryProvider.search(searchQuery);
      match = primaryResult.match;
      score = primaryResult.score;
    } catch (primaryError) {
      console.warn('Primary RAG retrieval failed. Engaging offline fallback:', primaryError.message);
      isFallback = true;
      try {
        const fallbackResult = await this.fallbackProvider.search(searchQuery);
        match = fallbackResult.match;
        score = fallbackResult.score;
      } catch (fallbackError) {
        console.warn('Fallback retrieval also failed:', fallbackError);
      }
    }

    // Strict Anti-Hallucination Guardrail:
    // If neither primary nor offline FAQ has an in-scope match, return exact fallback
    if (!match || score <= 0) {
      const fallbackAnswer = isAmharic
        ? AMHARIC_OUT_OF_SCOPE_FALLBACK
        : OUT_OF_SCOPE_FALLBACK;
      return {
        answer: fallbackAnswer,
        citation: null,
        source_url: null,
        offline: isFallback,
      };
    }

    let answer;
    const systemPrompt = buildTutorSystemPrompt(queryLang);

    if (!isFallback && client?.chat?.completions) {
      try {
        const userContent = isAmharic
          ? `[CONTEXT]:\n${match.text}\n\nStudent Question:\n${query}\n\nTranslated English Search Query:\n${searchQuery}\n\nPlease read these facts and EXPLAIN them to the student in a conversational, easy-to-understand way in Amharic (አማርኛ). Break down the core concepts, define any jargon, use bullet points, and include one clear, real-world analogy.`
          : `[CONTEXT]:\n${match.text}\n\nStudent Question:\n${query}\n\nPlease read these facts and EXPLAIN them to the student in a conversational, easy-to-understand way in English. Break down the core concepts, define any jargon, use bullet points, and include one clear, real-world analogy.`;

        const completion = await client.chat.completions.create(
          {
            system: systemPrompt,
            messages: [{ role: 'user', content: userContent }],
            temperature: 0.2,
            max_tokens: 1500,
          },
          { timeout: 20000 }
        );

        const aiText = completion.choices?.[0]?.message?.content?.trim();
        if (aiText) {
          answer = aiText;
        } else {
          answer = isAmharic ? formatAmharicTutorAnswer(match, query) : formatDynamicTutorAnswer(match, query);
        }
      } catch (apiError) {
        // Case 2: API Outage (The Partial Failure) - catch API error (500, 429, timeout, network failure)
        // Bypasses dynamic RAG generation and instantly serves a pre-written, structured answer from local offline-faq.json
        console.warn('Cloud LLM API error caught (outage, rate-limit, or timeout):', apiError.message);
        isFallback = true;
        try {
          const fallbackResult = await this.fallbackProvider.search(searchQuery);
          if (fallbackResult.match) {
            match = fallbackResult.match;
            score = fallbackResult.score;
            answer = isAmharic ? formatAmharicTutorAnswer(match, query) : (match.tutorExplanation || match.text);
          } else {
            answer = isAmharic ? formatAmharicTutorAnswer(match, query) : formatDynamicTutorAnswer(match, query);
          }
        } catch {
          answer = isAmharic ? formatAmharicTutorAnswer(match, query) : formatDynamicTutorAnswer(match, query);
        }
      }
    } else {
      answer = isAmharic ? formatAmharicTutorAnswer(match, query) : formatDynamicTutorAnswer(match, query);
    }

    // Determine citation & source URL based on the matched chunk
    let citation = match.citation;
    if (!citation) {
      citation = match.isJob
        ? 'Job Opportunities (jobs-data.json)'
        : isFallback
        ? 'Offline FAQ (backend/offline-faq.json)'
        : 'Lesson content (assets/learning-companion/lesson-content.js)';
    }

    let source_url = match.source_url;
    if (source_url && !source_url.startsWith('http://') && !source_url.startsWith('https://') && !source_url.startsWith('offline://')) {
      source_url = `${protocol}://${host}${source_url.startsWith('/') ? '' : '/'}${source_url}`;
    } else if (!source_url) {
      source_url = `${protocol}://${host}/pages/concept-with-navigation.html`;
    }

    return {
      answer,
      citation,
      source_url,
      offline: isFallback,
    };
  }
}

// Default instance of the pluggable AI service
export const defaultAIService = new PluggableAIService();

const router = express.Router();
router.use(express.json({ limit: '64kb' }));

router.post('/ai-tutor', async (req, res) => {
  try {
    const { query, lang = 'en', forceOffline } = req.body ?? {};

    if (typeof query !== 'string' || !query.trim()) {
      return res.status(400).json({ error: 'Provide a non‑empty `query` string.' });
    }
    const normalizedLang = (lang === 'am-ET' || lang === 'am') ? 'am' : (lang === 'en-US' || lang === 'en') ? 'en' : null;
    if (!normalizedLang) {
      return res.status(400).json({ error: "`lang` must be either 'en' or 'am'." });
    }

    const aiService = req.app?.get('aiService') || defaultAIService;
    const client = req.app?.get('aiClient');
    const isOffline = Boolean(forceOffline || req.headers['x-force-offline'] === 'true');
    const host = req.headers.host || 'localhost:3000';
    const protocol = req.protocol || 'http';

    const result = await aiService.query(query.trim(), {
      forceOffline: isOffline,
      client,
      host,
      protocol,
      lang: normalizedLang,
    });

    // Cloud Audio TTS generation
    const audioResult = await generateTutorAudio(result.answer, client);
    let audioDataUri = null;
    let audioUrl = null;
    if (audioResult && audioResult.buffer) {
      const audioId = randomUUID();
      if (tutorAudioCache.size > 100) {
        const firstKey = tutorAudioCache.keys().next().value;
        tutorAudioCache.delete(firstKey);
      }
      tutorAudioCache.set(audioId, audioResult);
      audioDataUri = `data:${audioResult.mimeType};base64,${audioResult.buffer.toString('base64')}`;
      audioUrl = audioResult.audioUrl || `${protocol}://${host}/api/ai-tutor/audio/${audioId}`;
    }

    return res.json({
      answer: result.answer,
      citation: result.citation,
      source_url: result.source_url,
      audio: audioDataUri,
      audio_url: audioUrl,
      is_cloud_audio: Boolean(audioResult?.isCloudGenerated),
    });
  } catch (e) {
    console.warn('ai-tutor error:', e);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

router.get('/ai-tutor/audio/:id', (req, res) => {
  const item = tutorAudioCache.get(req.params.id);
  if (!item) {
    return res.status(404).json({ error: 'Audio clip not found.' });
  }
  res.setHeader('Content-Type', item.mimeType);
  res.setHeader('Cache-Control', 'public, max-age=3600');
  return res.send(item.buffer);
});

export default router;
