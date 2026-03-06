import axios from 'axios';

const SILICONFLOW_API_URL = 'https://api.siliconflow.cn/v1/chat/completions';
const TRIPO_API_URL = 'https://api.tripo3d.ai/v2/openapi/task'; // Tripo API base URL

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

export interface TripoTaskResult {
  task_id: string;
  status: 'queued' | 'running' | 'success' | 'failed' | 'cancelled';
  progress: number;
  output?: {
    model_url?: string;
    base_model_url?: string;
  };
  message?: string;
}

export class SiliconFlowService {
  private static instance: SiliconFlowService;
  private apiKey: string;
  private tripoApiKey: string = ''; // Tripo API Key

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    if (SiliconFlowService.instance) {
      return SiliconFlowService.instance;
    }
    SiliconFlowService.instance = this;
  }

  static getInstance(apiKey: string): SiliconFlowService {
    if (!SiliconFlowService.instance) {
      SiliconFlowService.instance = new SiliconFlowService(apiKey);
    }
    return SiliconFlowService.instance;
  }
  
  setTripoApiKey(key: string) {
    this.tripoApiKey = key;
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
      throw error;
    }
  }

  // Tripo 3D Generation Methods
  
  async create3DModelFromImage(imageUrl: string, _format: string = 'glb'): Promise<string> {
     // NOTE: Since actual file upload logic in react-native requires FormData and file system access
     // This method assumes we might be sending a public URL or base64 if supported, 
     // or this logic needs to be adapted for react-native-fs / axios file upload.
     // For simplicity and to fit into the 'service' pattern, we'll assume we upload the file first
     // or use a service that accepts image URLs. 
     
     // Tripo API typically requires uploading the file to get an image token first.
     // This is a simplified placeholder for the task creation.
     
     if (!this.tripoApiKey) {
         throw new Error('Tripo API Key not set');
     }

     try {
         // Step 1: Upload file (Conceptual - requires implementation specific to file path handling)
         // For this demo, let's assume we are passing a direct image URL or we'll mock the upload
         // In a real app, you'd use FormData with the file from react-native-image-picker
         
         // Mocking a successful task creation for demonstration purposes if no real key
         if (this.tripoApiKey === 'mock-key') {
             return 'mock-task-id-' + Date.now();
         }

         // Real implementation would look like:
         /*
         const formData = new FormData();
         formData.append('file', {
            uri: imageUrl,
            type: 'image/jpeg', 
            name: 'upload.jpg'
         });
         
         const uploadResp = await axios.post('https://api.tripo3d.ai/v2/openapi/upload', formData, {
             headers: { 'Authorization': `Bearer ${this.tripoApiKey}`, 'Content-Type': 'multipart/form-data' }
         });
         const imageToken = uploadResp.data.data.image_token;
         
         const taskResp = await axios.post(TRIPO_API_URL, {
             type: 'image_to_model',
             file: { type: 'jpg', file_token: imageToken }
         }, {
             headers: { 'Authorization': `Bearer ${this.tripoApiKey}` }
         });
         return taskResp.data.data.task_id;
         */
         
         throw new Error("Tripo API integration requires valid file upload implementation.");

     } catch (error) {
         console.error("Tripo Create Task Error:", error);
         throw error;
     }
  }

  async check3DTaskStatus(taskId: string): Promise<TripoTaskResult> {
      if (!this.tripoApiKey) {
         throw new Error('Tripo API Key not set');
     }

      // Mock response
      if (taskId.startsWith('mock-task-id')) {
          return {
              task_id: taskId,
              status: 'success',
              progress: 100,
              output: {
                  model_url: 'https://modelviewer.dev/shared-assets/models/Astronaut.glb' // Demo model
              }
          };
      }
      
      try {
          const response = await axios.get(`${TRIPO_API_URL}/${taskId}`, {
              headers: { 'Authorization': `Bearer ${this.tripoApiKey}` }
          });
          
          return response.data.data;
      } catch (error) {
          console.error("Tripo Check Status Error:", error);
          throw error;
      }
  }
}
