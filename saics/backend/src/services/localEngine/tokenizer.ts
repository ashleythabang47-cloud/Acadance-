const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "been", "being", "but", "by",
  "can", "could", "did", "do", "does", "for", "from", "had", "has", "have",
  "he", "her", "here", "hers", "him", "his", "how", "i", "if", "in", "into",
  "is", "it", "its", "may", "might", "more", "most", "must", "of", "on",
  "or", "our", "ours", "she", "should", "so", "than", "that", "the", "their",
  "theirs", "them", "then", "there", "these", "they", "this", "those", "to",
  "was", "we", "were", "what", "when", "where", "which", "who", "why", "will",
  "with", "would", "you", "your",
]);

export function stemToken(token: string): string {
  let word = token.toLowerCase();
  if (word.length <= 3) return word;

  if (word.endsWith("ies") && word.length > 4) word = `${word.slice(0, -3)}y`;
  else if (word.endsWith("sses")) word = word.slice(0, -2);
  else if (word.endsWith("s") && !word.endsWith("ss")) word = word.slice(0, -1);

  const suffixes: [string, string][] = [
    ["ational", "ate"], ["tional", "tion"], ["fulness", "ful"],
    ["ousness", "ous"], ["iveness", "ive"], ["ization", "ize"],
    ["ation", "ate"], ["izer", "ize"], ["ment", ""], ["ness", ""],
    ["ingly", ""], ["edly", ""], ["ing", ""], ["ed", ""], ["ly", ""],
    ["ies", "y"], ["es", ""],
  ];
  for (const [suffix, replacement] of suffixes) {
    if (word.endsWith(suffix) && word.length - suffix.length >= 3) {
      word = `${word.slice(0, -suffix.length)}${replacement}`;
      break;
    }
  }
  return word;
}

export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? [])
    .filter((token) => !STOP_WORDS.has(token))
    .map(stemToken);
}

export function displayTerms(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? [])
    .filter((token) => !STOP_WORDS.has(token))
    .filter((token) => token.length > 1);
}

export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\r?\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}
