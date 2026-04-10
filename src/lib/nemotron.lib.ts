import OpenAI from 'openai';

const BASE_URL = process.env.NEMOTRON_BASE_URL ?? 'https://integrate.api.nvidia.com/v1';
const MODEL = process.env.NEMOTRON_MODEL ?? 'nvidia/nemotron-3-super-120b-a12b';
const MAX_TOKENS = parseInt(process.env.NEMOTRON_MAX_TOKENS ?? '16384', 10);
const REASONING_BUDGET = parseInt(process.env.NEMOTRON_REASONING_BUDGET ?? '16384', 10);

export class NemotronLib {
  private readonly client: OpenAI;

  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.NEMOTRON_API_KEY ?? '',
      baseURL: BASE_URL,
    });
  }

  async complete(prompt: string): Promise<string> {
    let result = '';
    const stream = await this.client.chat.completions.create({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 1,
      top_p: 0.95,
      max_tokens: MAX_TOKENS,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(({ reasoning_budget: REASONING_BUDGET, chat_template_kwargs: { enable_thinking: true } }) as any),
      stream: true,
    });

    for await (const chunk of stream) {
      result += chunk.choices[0]?.delta?.content ?? '';
    }
    return result;
  }

  parseJSON<T>(raw: string): T {
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1) {
      throw new Error(`Nemotron: no JSON object in response: ${cleaned.slice(0, 200)}`);
    }
    return JSON.parse(cleaned.slice(start, end + 1)) as T;
  }
}
