import OpenAI from 'openai';

export class OpenAIClient {
    private client: OpenAI;

    constructor() {
        if (!process.env.OPENAI_API_KEY) {
            console.warn('OPENAI_API_KEY is not set. AI features will fail.');
        }

        this.client = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });
    }

    async complete(prompt: string, model: string = 'gpt-4o'): Promise<string | null> {
        try {
            const completion = await this.client.chat.completions.create({
                messages: [{ role: 'user', content: prompt }],
                model: model,
                temperature: 0, // Strict analytical task
            });

            return completion.choices[0].message.content;
        } catch (error) {
            console.error('Error calling OpenAI:', error);
            throw new Error('Failed to get response from AI provider');
        }
    }
}
