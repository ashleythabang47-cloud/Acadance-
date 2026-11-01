process.env.JWT_SECRET = "test_secret";
process.env.JWT_EXPIRES_IN = "7d";

delete process.env.ANTHROPIC_API_KEY;
delete process.env.GROQ_API_KEY;
delete process.env.GEMINI_API_KEY;

// Keep accidental AI calls isolated from any locally running Ollama instance.
process.env.OLLAMA_BASE_URL = "http://127.0.0.1:1";
