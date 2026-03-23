# VisionGenie

一款智能照片调色修图应用，集成AI自动调色、语音控制调色、2D转3D和社区分享功能。

## 项目简介

VisionGenie 是一款基于 React Native 开发的智能照片调色应用，通过语音交互和AI智能解析，让用户轻松实现专业级的照片调色效果。应用支持多种风格模板，提供实时GPU渲染预览，并具备完整的社区分享功能。

### 核心特性

- **智能语音调色**：通过语音指令控制调色参数，支持连续语音交互
- **AI自动调色**：基于图像分析的首轮视觉建议，智能推荐调色方案
- **实时GPU渲染**：60fps实时预览，支持23个专业调色参数
- **2D转3D**：将2D照片转换为3D模型
- **社区分享**：发布调色作品，浏览社区内容，互动交流
- **多级降级策略**：云端AI -> 本地风格 -> 手动调整

## 技术栈

### 前端

- **框架**：React Native 0.84.1
- **语言**：TypeScript 5.8.3
- **UI库**：React Native Paper, React Native Reanimated
- **图形渲染**：@shopify/react-native-skia (Skia Runtime Shader)
- **导航**：React Navigation 7.x
- **状态管理**：Zustand 5.x
- **数据请求**：@tanstack/react-query 5.x
- **其他**：Lottie, Flash List, Fast Image等

### 后端

- **框架**：Node.js + Express
- **数据库**：SQLite (社区功能)
- **AI模型**：SiliconFlow API (Qwen3-VL系列)
- **3D服务**：Tripo API
- **认证**：JWT

### 原生模块

- **语音识别**：Android原生语音识别模块
- **图像处理**：C++原生库 (libraw, lcms2)

## 项目结构

```
VisionGenieApp/
├── src/                          # 前端应用代码
│   ├── screens/                   # 页面组件
│   │   ├── GPUColorGradingScreen.tsx      # 智能调色主界面
│   │   ├── HomeHubScreen.tsx              # 首页
│   │   ├── AIAgentScreen.tsx              # AI助手
│   │   └── CommunityScreen.tsx            # 社区
│   ├── components/                # 可复用组件
│   │   ├── image/
│   │   │   └── GPUColorGradingView.tsx    # GPU渲染组件
│   │   └── ui/                          # UI组件
│   ├── voice/                     # 语音调色模块
│   │   ├── useVoiceColorGrading.ts        # 语音控制Hook
│   │   ├── cloudInterpreter.ts             # 云端通信
│   │   ├── paramApplier.ts                # 参数应用
│   │   ├── styleMapper.ts                 # 风格映射
│   │   ├── imageContext.ts                # 图像上下文
│   │   ├── speechRecognizer.ts            # 语音识别
│   │   ├── contracts.ts                  # 契约定义
│   │   └── types.ts                      # 类型定义
│   ├── colorEngine/               # 调色引擎
│   │   ├── engineSelector.ts             # 引擎选择
│   │   └── core/
│   │       └── operators.ts              # 操作符
│   ├── modules/                   # 业务模块
│   │   ├── api/                        # API客户端
│   │   └── agent/                       # AI助手
│   ├── types/                     # 类型定义
│   │   ├── colorGrading.ts              # 调色类型
│   │   └── colorEngine.ts              # 引擎类型
│   └── App.tsx                    # 应用入口
├── backend/                       # 后端服务
│   ├── src/
│   │   ├── server.js                 # 服务器入口
│   │   ├── modules/                  # 业务模块
│   │   │   ├── colorModule.js        # 调色模块
│   │   │   ├── modelingModule.js     # 3D建模模块
│   │   │   ├── agentModule.js        # AI助手模块
│   │   │   └── communityModule.js   # 社区模块
│   │   ├── colorIntelligence/        # 智能调色服务
│   │   │   ├── services/
│   │   │   │   ├── interpretService.js       # 语音解析
│   │   │   │   ├── autoGradeService.js     # 自动调色
│   │   │   │   └── segmentationService.js  # 图像分割
│   │   │   └── health/                     # 健康检查
│   │   ├── providers/                # AI提供商
│   │   │   ├── index.js
│   │   │   ├── openaiCompat.js            # OpenAI兼容接口
│   │   │   └── fallback.js               # 降级策略
│   │   ├── imageTo3d/                # 2D转3D服务
│   │   │   └── routes/
│   │   ├── account/                  # 用户账户
│   │   │   ├── routes.js
│   │   │   └── repository.js
│   │   └── community/                # 社区功能
│   │       ├── routes.js
│   │       └── repository.js
│   ├── migrations/                 # 数据库迁移
│   ├── scripts/                    # 工具脚本
│   ├── data/                       # 运行时数据
│   └── .env                        # 环境配置
├── android/                       # Android原生代码
│   └── app/src/main/java/com/visiongenieapp/
│       └── voice/
│           ├── VoiceRecognitionModule.kt    # 语音识别模块
│           └── VoiceRecognitionPackage.kt
├── ios/                          # iOS原生代码
├── __tests__/                    # 测试文件
└── package.json                  # 前端依赖配置
```

## 快速开始

### 环境要求

- Node.js >= 22.11.0
- React Native CLI
- Android Studio (Android开发)
- Xcode (iOS开发)

### 安装依赖

```bash
# 安装前端依赖
npm install

# 安装后端依赖
cd backend
npm install
```

### 配置环境变量

```bash
cd backend
cp .env.example .env
# 编辑 .env 文件，配置必要的API密钥
```

### 启动服务

#### 启动后端服务

```bash
# 方式1：在backend目录下启动
cd backend
npm start

# 方式2：从项目根目录启动
npm run backend:start
```

后端服务默认运行在 `http://127.0.0.1:8787`

#### 启动前端开发服务器

```bash
# 启动Metro开发服务器
npm run frontend:start

# 运行Android应用
npm run android

# 运行iOS应用
npm run ios
```

### 健康检查

```bash
# 检查后端服务状态
curl http://127.0.0.1:8787/health

# 检查所有模块状态
curl http://127.0.0.1:8787/v1/modules/health
```

## 功能模块

### 1. 智能调色系统

#### 语音调色

- **语音识别**：使用Android原生语音识别，支持中文语音输入
- **连续交互**：按住说话，松开即应用，支持连续多条指令
- **实时反馈**：显示语音识别结果和调色效果
- **撤销功能**：支持单次撤销（3秒内）和会话撤销

#### AI自动调色

- **首轮建议**：上传图片后自动分析并生成初始调色方案
- **场景识别**：智能识别人像、风景、天空等场景
- **参数优化**：基于图像统计信息自动调整23个调色参数

#### GPU实时渲染

- **双引擎架构**：
  - Legacy模式：基础矩阵，兼容性好
  - Pro模式：Runtime Shader，完整功能
- **60fps预览**：实时显示调色效果
- **专业参数**：支持曝光、对比度、色温、曲线、色轮等23个参数

### 2. 2D转3D

- **Tripo集成**：使用Tripo API进行2D到3D转换
- **多格式输出**：支持GLB等多种3D格式
- **纹理支持**：可选PBR材质和纹理
- **任务管理**：异步任务处理，支持进度查询

### 3. AI助手

- **智能规划**：基于用户需求生成操作计划
- **执行引擎**：自动执行复杂的调色任务
- **记忆系统**：保存用户偏好和历史记录
- **自然交互**：支持自然语言对话

### 4. 社区功能

- **内容发布**：发布调色作品，支持前后对比
- **内容浏览**：按标签筛选，瀑布流展示
- **互动功能**：点赞、收藏、评论
- **草稿管理**：保存未完成的作品

## API文档

### 调色模块

```
POST /v1/modules/color/initial-suggest    # 首轮视觉建议
POST /v1/modules/color/voice-refine       # 语音调色解析
POST /v1/modules/color/pro/auto-grade     # 专业自动调色
POST /v1/modules/color/pro/segment        # 图像分割
GET  /v1/modules/color/health           # 健康检查
```

### 3D建模模块

```
POST /v1/modules/modeling/jobs                    # 创建建模任务
GET  /v1/modules/modeling/jobs/:taskId           # 查询任务状态
GET  /v1/modules/modeling/jobs/:taskId/assets    # 获取任务资源
POST /v1/modules/modeling/capture-sessions       # 创建捕获会话
GET  /v1/modules/modeling/capture-sessions/:id   # 查询捕获会话
POST /v1/modules/modeling/capture-sessions/:id/generate  # 生成3D模型
GET  /v1/modules/modeling/health                # 健康检查
```

### AI助手模块

```
POST /v1/modules/agent/plan              # 生成操作计划
POST /v1/modules/agent/execute           # 执行操作
POST /v1/modules/agent/memory/upsert     # 更新记忆
POST /v1/modules/agent/memory/query      # 查询记忆
GET  /v1/modules/agent/health           # 健康检查
```

### 社区模块

```
GET  /v1/modules/community/feed                    # 获取社区内容
GET  /v1/modules/community/me/posts               # 获取我的帖子
POST /v1/modules/community/drafts                # 创建草稿
PUT  /v1/modules/community/drafts/:id            # 更新草稿
POST /v1/modules/community/drafts/:id/publish    # 发布草稿
POST /v1/modules/community/posts/:id/like        # 点赞
POST /v1/modules/community/posts/:id/save        # 收藏
GET  /v1/modules/community/posts/:id/comments    # 获取评论
POST /v1/modules/community/posts/:id/comments    # 发表评论
GET  /v1/modules/community/health               # 健康检查
```

### 账户认证

```
POST /v1/auth/register              # 用户注册
POST /v1/auth/login                 # 用户登录
GET  /v1/profile/me               # 获取个人信息
PATCH /v1/profile/me               # 更新个人信息
PATCH /v1/profile/me/settings      # 更新设置
```

## 智能调色架构

### 整体架构

智能调色系统采用**语音驱动 + 云端AI解析 + GPU实时渲染**的架构：

1. **用户交互层**：GPUColorGradingScreen.tsx - 提供语音控制界面和实时预览
2. **语音处理层**：useVoiceColorGrading.ts - 管理语音识别和调色流程
3. **云端解析层**：cloudInterpreter.ts - 与后端AI服务通信
4. **参数应用层**：paramApplier.ts - 将AI解析结果应用到调色参数
5. **GPU渲染层**：GPUColorGradingView.tsx - 使用Skia Runtime Shader进行实时渲染

### 数据流

```
用户语音 -> 语音识别 -> 文本转录 -> 云端AI解析 -> 参数动作 -> 参数应用 -> GPU渲染 -> 实时预览
         ^                                                                    |
         |                                                                    |
         ----------------------- 图像上下文分析 ---------------------------------
```

### 智能特性

- **收敛衰减机制**：防止重复指令导致参数过度调整
- **撤销系统**：支持单次撤销和会话撤销
- **智能兜底**：云端解析失败时自动切换到本地风格匹配
- **性能优化**：图像降采样、GPU加速、增量更新

## 开发指南

### 代码规范

- 前端代码使用TypeScript
- 遵循ESLint配置
- 使用Prettier格式化代码
- 前端与后端通过HTTP API通信，禁止直接导入

### 测试

```bash
# 运行所有测试
npm test

# 运行后端冒烟测试
cd backend
npm run test:smoke

# 运行账户功能测试
npm run test:account

# 运行严格模式预检查
npm run precheck:strict
```

### 调试

```bash
# 启动开发服务器（带调试）
npm run frontend:start

# Android调试
adb logcat | grep VisionGenie

# iOS调试
# 在Xcode中运行项目
```

## 常见问题

### 后端启动失败

**问题**：端口8787被占用

**解决方案**：
```bash
# Windows
netstat -ano | findstr :8787
taskkill /PID <进程ID> /F

# macOS/Linux
lsof -i :8787
kill -9 <进程ID>
```

### 语音识别不可用

**问题**：语音识别服务不可用

**解决方案**：
1. 检查设备是否支持语音识别
2. 在系统设置中启用语音输入
3. 检查麦克风权限

### 云端AI服务超时

**问题**：AI服务响应超时

**解决方案**：
1. 检查网络连接
2. 确认API密钥配置正确
3. 系统会自动降级到本地风格匹配

### Metro开发服务器问题

**问题**：Metro服务器无法连接

**解决方案**：
```bash
# 清除Metro缓存
npm start -- --reset-cache

# 清除node_modules并重新安装
rm -rf node_modules
npm install
```

## 性能优化

### 前端优化

- 使用Flash List优化长列表渲染
- 图像使用Fast Image组件
- 避免不必要的重渲染
- 使用React.memo和useMemo

### 后端优化

- 图像降采样处理（24-96像素）
- GPU加速渲染
- 增量更新参数
- 缓存机制（LUT和着色器）

## 部署

### 前端部署

```bash
# Android打包
cd android
./gradlew assembleRelease

# iOS打包
# 在Xcode中配置签名并打包
```

### 后端部署

```bash
# 使用PM2管理进程
npm install -g pm2
pm2 start backend/src/server.js --name visiongenie-backend

# 使用Docker
docker build -t visiongenie-backend .
docker run -p 8787:8787 visiongenie-backend
```

## 贡献指南

欢迎贡献代码！请遵循以下步骤：

1. Fork本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启Pull Request

## 许可证

本项目采用MIT许可证 - 详见LICENSE文件

## 联系方式

如有问题或建议，请通过以下方式联系：

- 提交Issue
- 发送邮件至项目维护者

## 致谢

感谢所有为本项目做出贡献的开发者！

---

**VisionGenie** - 让调色变得简单而专业