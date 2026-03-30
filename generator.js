import OpenAI from "openai";
const PLATFORM_PROMPTS = {
  linkedin: (content, tone, brand) => `You are a content repurposing expert for ${brand} at dabcloud.in. Write a LinkedIn post with a bold hook, 3-5 insights, a question at the end, and 3-5 hashtags. Max 1500 chars. SOURCE: """${content}""" Output ONLY the post.`,
  twitter: (content, tone, brand) => `You are a content repurposing expert for ${brand}. Write a 4-tweet Twitter thread. Number them 1/4 to 4/4. Each under 280 chars. Blank line between tweets. SOURCE: """${content}""" Output ONLY the tweets.`,
  facebook: (content, tone, brand) => `You are a content repurposing expert for ${brand}. Write a Facebook post with a story, 2-3 takeaways, end with a question. Max 1000 chars. SOURCE: """${content}""" Output ONLY the post.`,
  instagram: (content, tone, brand) => `You are a content repurposing expert for ${brand}. Write an Instagram caption with a hook, 3-4 paragraphs, CTA, and 15-20 hashtags at end. SOURCE: """${content}""" Output ONLY the caption.`,
};
export async function generateContent(content, platform, tone, brand, apiKey) {
  if (!apiKey || apiKey === "YOUR_OPENAI_API_KEY") throw new Error("API key missing");
  const client = new OpenAI({ apiKey });
  const promptFn = PLATFORM_PROMPTS[platform];
  if (!promptFn) throw new Error(`Unknown platform: ${platform}`);
  const response = await client.chat.completions.create({ model: "gpt-4o", max_tokens: 1024, messages: [{ role: "user", content: promptFn(content, tone, brand) }] });
  return response.choices[0].message.content.trim();
}
