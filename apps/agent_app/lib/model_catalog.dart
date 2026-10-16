// Catalog checked 2026-10-10 against provider docs and the Codex model cache.
// Gemini: https://ai.google.dev/gemini-api/docs/models
// OpenRouter: https://openrouter.ai/api/v1/models
// Groq: https://console.groq.com/docs/models
// shortcut: catalogs change; refresh these suggestions when providers add models.
const modelCatalog = <String, List<String>>{
  'codex': [
    'gpt-6-luna',
    'gpt-6.1-sol',
    'gpt-6-astra',
    'gpt-6-sol',
    'gpt-5.6-sol',
    'gpt-5.6-terra',
    'gpt-5.6-luna',
  ],
  // 2026-10-10 Owner policy: Gemini Chat exposes only Flash-Lite.
  // Model availability still depends on the provider and project eligibility.
  'gemini': [
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-2.5-flash-lite',
  ],
  'openrouter': [
    'openrouter/free',
    'inclusionai/ling-3.1-flash',
    'apodex/apodex-1.1-mini:free',
    'dots-studio/dots-3-note-preview:free',
    'liquid/lfm-2.5-2.6b:free',
    'nvidia/nemotron-3.5-lightning:free',
    'thinkingmachines/inkling-small:free',
    'poolside/laguna-s-2.1:free',
    'thinkingmachines/inkling:free',
    'poolside/laguna-xs-2.1:free',
    'cohere/north-mini-code:free',
    'nvidia/nemotron-3.5-content-safety:free',
    'nvidia/nemotron-3-ultra-550b-a55b:free',
    'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
    'google/gemma-4-26b-a4b-it:free',
    'google/gemma-4-31b-it:free',
    'nvidia/nemotron-3-super-120b-a12b:free',
  ],
  'groq': [
    'llama-3.1-8b-instant',
    'llama-3.3-70b-versatile',
    'openai/gpt-oss-120b',
    'openai/gpt-oss-20b',
    'minimaxai/minimax-m2.7',
    'qwen/qwen3.8-27b',
    'openai/gpt-oss-safeguard-20b',
  ],
};
