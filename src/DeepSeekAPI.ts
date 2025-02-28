type Message = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type DeepSeekResponse = {
  choices: {
      message: {
          content: string;
      };
  }[];
};

class DeepSeekAPI {
  private readonly apiKey: string;
  private context: Record<string, unknown>;
  private baseUrl: string;

  constructor(apiKey: string) {
      this.apiKey = apiKey;
      this.context = {};
      this.baseUrl = 'https://api.deepseek.com/v1'; // Revisar URL real de la API
  }

  /**
   * Establece el contexto para las próximas preguntas
   * @param context Objeto JSON con el contexto
   */
  setContext(context: Record<string, unknown>): void {
      this.context = context;
  }

  /**
   * Agrega información adicional al contexto existente
   * @param additionalContext Objeto JSON con contexto adicional
   */
  addContext(additionalContext: Record<string, unknown>): void {
      this.context = {...this.context, ...additionalContext};
  }

  /**
   * Realiza una pregunta a la API de DeepSeek con el contexto actual
   * @param prompt Pregunta del usuario
   * @param customContext Contexto personalizado opcional
   * @returns Respuesta de la API
   */
  async askQuestion(
      prompt: string,
      customContext?: Record<string, unknown>
  ): Promise<string> {
      try {
          const contextToUse = customContext || this.context;
          const messages = this.buildMessages(prompt, contextToUse);

          const response = await fetch(`${this.baseUrl}/chat/completions`, {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${this.apiKey}`,
              },
              body: JSON.stringify({
                  model: 'deepseek-chat',
                  messages: messages,
                  temperature: 0.7,
                  max_tokens: 1000,
              }),
          });

          if (!response.ok) {
              throw new Error(`Error en la API: ${response.statusText}`);
          }

          const data: DeepSeekResponse = await response.json();
          return data.choices[0].message.content;
      } catch (error) {
          throw new Error(`Error al procesar la solicitud: ${error instanceof Error ? error.message : String(error)}`);
      }
  }

  private buildMessages(
      prompt: string,
      context: Record<string, unknown>
  ): Message[] {
      const messages: Message[] = [];

      if (Object.keys(context).length > 0) {
          messages.push({
              role: 'system',
              content: `Contexto actual: ${JSON.stringify(context)}`,
          });
      }

      messages.push({
          role: 'user',
          content: prompt,
      });

      return messages;
  }
}

export default DeepSeekAPI;