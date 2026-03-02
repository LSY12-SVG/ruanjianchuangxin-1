import axios from 'axios';

const SILICONFLOW_API_URL = 'https://api.siliconflow.cn/v1/chat/completions';

export interface SiliconFlowMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface SiliconFlowResponse {
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface ColorAnalysisResult {
  detectedStyles: string[];
  confidence: number;
  params: {
    temperature?: number;
    saturation?: number;
    brightness?: number;
    contrast?: number;
    exposure?: number;
    tint?: number;
    vibrance?: number;
    hue?: number;
  };
}

export class SiliconFlowService {
  private static instance: SiliconFlowService;
  private apiKey: string;

  constructor(apiKey: string) {
    if (SiliconFlowService.instance) {
      return SiliconFlowService.instance;
    }
    SiliconFlowService.instance = this;
    this.apiKey = apiKey;
  }

  static getInstance(apiKey: string): SiliconFlowService {
    if (!SiliconFlowService.instance) {
      SiliconFlowService.instance = new SiliconFlowService(apiKey);
    }
    return SiliconFlowService.instance;
  }

  async analyzeColorDescription(
    description: string,
    model: string = 'Qwen/Qwen2.5-7B-Instruct'
  ): Promise<ColorAnalysisResult> {
    const systemPrompt = `你是一个专业的图像调色助手。用户会描述他们想要的调色效果，你需要分析这个描述并输出对应的调色参数。

请按照以下JSON格式输出，只输出JSON，不要包含其他文字：
{
  "detectedStyles": ["风格关键词列表"],
  "confidence": 0.0-1.0之间的置信度,
  "params": {
    "temperature": -100到100之间的色温值,
    "saturation": -100到100之间的饱和度值,
    "brightness": -100到100之间的亮度值,
    "contrast": -100到100之间的对比度值,
    "exposure": -100到100之间的曝光值,
    "tint": -100到100之间的色调值,
    "vibrance": -100到100之间的鲜艳度值,
    "hue": -100到100之间的色相值
  }
}

风格关键词参考：
- warm（温暖）、cool（冷调）、vintage（复古）、blackWhite（黑白）、fresh（清新）、dreamy（梦幻）、dramatic（戏剧）、soft（柔和）、vibrant（鲜艳）、muted（低调）

参数说明：
- temperature: 正数表示暖色调，负数表示冷色调
- saturation: 正数表示增加饱和度，负数表示降低饱和度
- brightness: 正数表示更亮，负数表示更暗
- contrast: 正数表示增加对比度，负数表示降低对比度
- exposure: 正数表示增加曝光，负数表示减少曝光
- tint: 色调调整
- vibrance: 鲜艳度调整
- hue: 色相旋转

请根据用户的描述，智能推断最合适的参数值。`;

    try {
      const response = await axios.post<SiliconFlowResponse>(
        SILICONFLOW_API_URL,
        {
          model: model,
          messages: [
            {
              role: 'system',
              content: systemPrompt,
            },
            {
              role: 'user',
              content: `分析这个调色描述：${description}`,
            },
          ],
          temperature: 0.7,
          max_tokens: 512,
          stream: false,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );

      const assistantMessage = response.data.choices[0]?.message?.content;
      
      if (!assistantMessage) {
        throw new Error('No response from model');
      }

      const jsonMatch = assistantMessage.match(/```json\n?([\s\S]*?)\n?```/);
      const jsonContent = jsonMatch ? jsonMatch[1] : assistantMessage;

      const result = JSON.parse(jsonContent);

      return {
        detectedStyles: result.detectedStyles || [],
        confidence: result.confidence || 0.8,
        params: result.params || {},
      };
    } catch (error) {
      console.error('SiliconFlow API error:', error);
      
      if (axios.isAxiosError(error)) {
        const axiosError = error as any;
        if (axiosError.response?.status === 401) {
          throw new Error('API Key 无效，请检查配置');
        }
        if (axiosError.response?.status === 429) {
          throw new Error('API 调用频率超限，请稍后重试');
        }
      }
      
      throw new Error(`API 调用失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async analyzeWithStreaming(
    description: string,
    model: string = 'Qwen/Qwen2.5-7B-Instruct',
    onChunk?: (chunk: string) => void
  ): Promise<ColorAnalysisResult> {
    const systemPrompt = `你是一个专业的图像调色助手。用户会描述他们想要的调色效果，你需要分析这个描述并输出对应的调色参数。

请按照以下JSON格式输出，只输出JSON，不要包含其他文字：
{
  "detectedStyles": ["风格关键词列表"],
  "confidence": 0.0-1.0之间的置信度,
  "params": {
    "temperature": -100到100之间的色温值,
    "saturation": -100到100之间的饱和度值,
    "brightness": -100到100之间的亮度值,
    "contrast": -100到100之间的对比度值,
    "exposure": -100到100之间的曝光值,
    "tint": -100到100之间的色调值,
    "vibrance": -100到100之间的鲜艳度值,
    "hue": -100到100之间的色相值
  }
}`;

    try {
      const response = await axios.post(
        SILICONFLOW_API_URL,
        {
          model: model,
          messages: [
            {
              role: 'system',
              content: systemPrompt,
            },
            {
              role: 'user',
              content: `分析这个调色描述：${description}`,
            },
          ],
          temperature: 0.7,
          max_tokens: 512,
          stream: true,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          responseType: 'stream',
          timeout: 30000,
        }
      );

      let fullContent = '';
      
      for await (const chunk of response.data) {
        const lines = chunk.toString().split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            
            try {
              const parsed = JSON.parse(data);
              if (parsed.choices?.[0]?.delta?.content) {
                const content = parsed.choices[0].delta.content;
                fullContent += content;
                if (onChunk) {
                  onChunk(content);
                }
              }
            } catch (e) {
            }
          }
        }
      }

      const jsonMatch = fullContent.match(/```json\n?([\s\S]*?)\n?```/);
      const jsonContent = jsonMatch ? jsonMatch[1] : fullContent;

      const result = JSON.parse(jsonContent);

      return {
        detectedStyles: result.detectedStyles || [],
        confidence: result.confidence || 0.8,
        params: result.params || {},
      };
    } catch (error) {
      console.error('SiliconFlow streaming API error:', error);
      throw new Error(`流式API调用失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  getModelRecommendations(): Array<{ id: string; name: string; description: string; free: boolean }> {
    return [
      {
        id: 'Qwen/Qwen2.5-7B-Instruct',
        name: 'Qwen2.5-7B',
        description: '轻量级模型，响应速度快，适合实时调色建议',
        free: true,
      },
      {
        id: 'Qwen/Qwen2.5-14B-Instruct',
        name: 'Qwen2.5-14B',
        description: '中等规模模型，理解能力强，适合复杂风格分析',
        free: true,
      },
      {
        id: 'Qwen/Qwen2.5-72B-Instruct',
        name: 'Qwen2.5-72B',
        description: '大规模模型，理解能力最强，适合深度风格分析',
        free: true,
      },
      {
        id: 'deepseek-ai/DeepSeek-V2.5',
        name: 'DeepSeek-V2.5',
        description: 'DeepSeek最新模型，代码和推理能力强',
        free: true,
      },
    ];
  }
}

export default SiliconFlowService;
