import axios from 'axios';

export interface ColorParams {
  brightness?: number;
  contrast?: number;
  saturation?: number;
  hue?: number;
  temperature?: number;
  tint?: number;
  exposure?: number;
  shadows?: number;
  highlights?: number;
  vibrance?: number;
}

export interface StyleAnalysis {
  detectedStyles: string[];
  confidence: number;
  params: ColorParams;
}

const STYLE_KEYWORDS = {
  warm: ['温暖', '暖色调', '暖', '阳光', '金色', '橙', '黄', '夕阳', '黄昏'],
  cool: ['冷色调', '冷', '蓝调', '清冷', '冰', '雪', '清晨', '海洋'],
  vintage: ['复古', '怀旧', '胶片', '老照片', '经典', '年代感', '复古风'],
  blackWhite: ['黑白', '单色', '灰度', '经典黑白', '黑白电影'],
  fresh: ['清新', '自然', '明亮', '通透', '清透', '活力'],
  dreamy: ['梦幻', '紫调', '浪漫', '柔光', '朦胧', '仙境'],
  dramatic: ['戏剧', '强烈', '冲击', '对比', '高对比'],
  soft: ['柔和', '柔', '温和', '淡雅', '轻柔'],
  vibrant: ['鲜艳', '饱和', '色彩', '活力', '鲜艳度'],
  muted: ['低饱和', '淡', '褪色', '低调', '柔和色彩'],
};

const PARAM_KEYWORDS = {
  brightness: {
    increase: ['更亮', '变亮', '提亮', '增加亮度', '曝光'],
    decrease: ['更暗', '变暗', '降低亮度', '减光'],
  },
  contrast: {
    increase: ['增加对比度', '高对比', '增强对比', '对比强'],
    decrease: ['降低对比度', '低对比', '柔和对比'],
  },
  saturation: {
    increase: ['增加饱和度', '更鲜艳', '色彩鲜艳', '饱和'],
    decrease: ['降低饱和度', '褪色', '低饱和', '淡色'],
  },
  exposure: {
    increase: ['增加曝光', '过曝', '亮部'],
    decrease: ['减少曝光', '欠曝', '暗部'],
  },
};

export class NLPService {
  private static instance: NLPService;

  constructor() {
    if (NLPService.instance) {
      return NLPService.instance;
    }
    NLPService.instance = this;
  }

  static getInstance(): NLPService {
    if (!NLPService.instance) {
      NLPService.instance = new NLPService();
    }
    return NLPService.instance;
  }

  analyzeText(text: string): StyleAnalysis {
    const detectedStyles: string[] = [];
    const params: ColorParams = {};

    const lowerText = text.toLowerCase();

    for (const [style, keywords] of Object.entries(STYLE_KEYWORDS)) {
      for (const keyword of keywords) {
        if (text.includes(keyword)) {
          if (!detectedStyles.includes(style)) {
            detectedStyles.push(style);
          }
          break;
        }
      }
    }

    for (const [param, directions] of Object.entries(PARAM_KEYWORDS)) {
      for (const [direction, keywords] of Object.entries(directions)) {
        for (const keyword of keywords) {
          if (text.includes(keyword)) {
            const value = direction === 'increase' ? 30 : -30;
            (params as any)[param] = value;
            break;
          }
        }
      }
    }

    const styleParams = this.getStyleParams(detectedStyles);
    Object.assign(params, styleParams);

    const confidence = detectedStyles.length > 0 ? 0.8 : 0.3;

    return {
      detectedStyles,
      confidence,
      params,
    };
  }

  private getStyleParams(styles: string[]): ColorParams {
    const params: ColorParams = {};

    if (styles.includes('warm')) {
      params.temperature = 40;
      params.saturation = 15;
      params.brightness = 10;
    }

    if (styles.includes('cool')) {
      params.temperature = -40;
      params.saturation = -10;
      params.tint = 15;
    }

    if (styles.includes('vintage')) {
      params.contrast = 20;
      params.saturation = -25;
      params.exposure = -10;
      params.vibrance = -20;
    }

    if (styles.includes('blackWhite')) {
      params.saturation = -100;
      params.contrast = 15;
    }

    if (styles.includes('fresh')) {
      params.brightness = 15;
      params.contrast = 10;
      params.saturation = 20;
      params.exposure = 10;
    }

    if (styles.includes('dreamy')) {
      params.brightness = 8;
      params.saturation = -15;
      params.contrast = -15;
      params.tint = 20;
      params.hue = 10;
    }

    if (styles.includes('dramatic')) {
      params.contrast = 40;
      params.saturation = 25;
      params.shadows = -20;
      params.highlights = 15;
    }

    if (styles.includes('soft')) {
      params.contrast = -20;
      params.saturation = -15;
      params.brightness = 8;
    }

    if (styles.includes('vibrant')) {
      params.saturation = 40;
      params.vibrance = 35;
      params.contrast = 20;
    }

    if (styles.includes('muted')) {
      params.saturation = -40;
      params.contrast = -15;
      params.vibrance = -30;
    }

    return params;
  }

  async analyzeWithHuggingFace(text: string): Promise<StyleAnalysis> {
    try {
      const response = await axios.post(
        'https://api-inference.huggingface.co/models/facebook/bart-large-mnli',
        {
          inputs: text,
          parameters: {
            candidate_labels: [
              'warm',
              'cool',
              'vintage',
              'black and white',
              'fresh',
              'dreamy',
              'dramatic',
              'soft',
              'vibrant',
              'muted',
            ],
          },
        },
        {
          headers: {
            Authorization: 'Bearer YOUR_HUGGING_FACE_API_KEY',
          },
        }
      );

      const labels = response.data.labels || [];
      const scores = response.data.scores || [];

      const detectedStyles: string[] = [];
      const params: ColorParams = {};

      labels.forEach((label: string, index: number) => {
        if (scores[index] > 0.3) {
          const styleKey = label.replace(/\s+/g, '');
          if (!detectedStyles.includes(styleKey)) {
            detectedStyles.push(styleKey);
          }
        }
      });

      const styleParams = this.getStyleParams(detectedStyles);
      Object.assign(params, styleParams);

      const confidence = scores[0] || 0.5;

      return {
        detectedStyles,
        confidence,
        params,
      };
    } catch (error) {
      console.error('Hugging Face API error:', error);
      return this.analyzeText(text);
    }
  }

  generateDescription(params: ColorParams): string {
    const descriptions: string[] = [];

    if (params.temperature && params.temperature > 20) {
      descriptions.push('暖色调');
    } else if (params.temperature && params.temperature < -20) {
      descriptions.push('冷色调');
    }

    if (params.contrast && params.contrast > 20) {
      descriptions.push('高对比度');
    } else if (params.contrast && params.contrast < -20) {
      descriptions.push('低对比度');
    }

    if (params.saturation && params.saturation > 20) {
      descriptions.push('高饱和度');
    } else if (params.saturation && params.saturation < -20) {
      descriptions.push('低饱和度');
    }

    if (params.brightness && params.brightness > 15) {
      descriptions.push('更明亮');
    } else if (params.brightness && params.brightness < -15) {
      descriptions.push('更暗淡');
    }

    return descriptions.length > 0 
      ? `应用了${descriptions.join('、')}效果` 
      : '自定义调色效果';
  }
}

export default NLPService;
