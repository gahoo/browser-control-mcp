---
tags: ["{{tags}}"] # 例: #ai-model #t2i #huggingface
title: "{{model_name}}"
short_description: "{{short_description}}" # 一句话中文简介
family: "{{family}}" # 【新增】模型家族，例: Llama 3, Qwen 2.5, Stable Diffusion
organization: "{{organization}}" # 例: Qwen, Stability AI
modality: "{{modality}}" # 枚举: LLM, Vision, Image, ASR, TTS, Audio, Multimodal, App/Framework
task: "{{task}}" # 例: Text-to-Image, Object Detection, Speech Recognition
license: "{{license}}" 
parameters: "{{parameters}}" # 例: 8B, 109M
context_window: "{{context_window}}" # 例: 128k tokens, 1024x1024 px, 30s audio
quantization: ["{{quantization}}"] # 例: FP8, GGUF, INT4
vram_required: "{{vram_required}}" # 例: 16GB, 24GB (最低推理显存)
supported_hardware: ["{{hardware}}"] # 【新增】例: NVIDIA GPU, AMD GPU, Apple Silicon, CPU, NPU
downloads: {{downloads}} 

# --- 核心对比指标 (提取最核心的1个指标到 YAML，方便 Bases 表格排序，按需填写，其余留空) ---
metric_mmlu: {{metric_mmlu}} # LLM 智力
metric_f1_map: {{metric_f1_map}} # 判别式任务 (分类/检测)
metric_fid: {{metric_fid}} # 视觉生成任务 (越低越好)
metric_wer: {{metric_wer}} # ASR 错误率 (越低越好)
metric_mos: {{metric_mos}} # TTS 自然度 (越高越好)
metric_mmmu: {{metric_mmmu}} # 多模态综合
metric_throughput: {{metric_throughput}} # 核心吞吐量 (Tokens/s 或 FPS)

# --- 管理与状态 ---
status: pending # 可选: pending (待测), evaluating (评估中), adopted (已采用), rejected (不建议)
rating: {{rating}} # 总体评分 1-5
date_released: "{{date_released}}"
source: "{{hf_url}}"
paper_url: "{{paper_url}}"
---

# {{model_name}}

> [!ABSTRACT] 模型简介
> {{description}} # 详细的模型背景、目标、核心架构（如 Diffusion, MoE, Transformer）描述

## 💎 核心价值与适用场景
- **所属家族 (Model Family)**: {{family}} # 家族生态继承性说明
- **核心价值 (Value Points)**: {{value_points}}
- **适用场景 (Use Cases)**: {{use_cases}}
- **局限性与安全性 (Limitations & Safety)**: {{limitations}} # 幻觉、偏见、版权风险、特定语言支持差等

## 📊 性能评估 (Performance Metrics)
*(提示：请根据当前模型的 `modality` 保留对应的区块，删除无关区块)*

### 📝 LLM (大语言模型)
- **MMLU / C-Eval (综合知识)**: {{mmlu_score}}
- **HumanEval / MBPP (代码生成)**: {{code_score}}
- **GSM8K / MATH (数学推理)**: {{math_score}}
- **Arena Elo / Chat (人类偏好)**: {{elo_score}}

### 👁️ Vision (视觉理解: 分类/检测/分割)
- **Accuracy / F1**: {{accuracy_score}}
- **mAP (目标检测)**: {{map_score}}
- **mIoU (图像分割)**: {{miou_score}}

### 🎨 Image (图像生成: 文生图/图生图/视频生成)
- **FID (真实度/分布差异)**: {{fid_score}} *(越低越好)*
- **CLIP Score (图文一致性)**: {{clip_score}}
- **Aesthetic Score (美学评分)**: {{aesthetic_score}}

### 👂 ASR (语音识别)
- **WER (英文词错误率)**: {{wer_score}} *(越低越好)*
- **CER (中文字符错误率)**: {{cer_score}} *(越低越好)*
- **RTF (实时率)**: {{rtf_score}} # 反映推理速度

### 🗣️ TTS (语音合成)
- **MOS (主观自然度)**: {{mos_score}} *(满分5分)*
- **Speaker Similarity (音色克隆相似度)**: {{sim_score}}
- **RTF (实时率)**: {{rtf_score}}

### 🎵 Audio (音频理解与生成)
- **Audio QA / ASR 能力**: {{audio_qa_score}} # 针对 Qwen-Audio 等 Audio-LLM
- **FAD (音频生成保真度)**: {{fad_score}} # 针对 MusicGen 等生成模型
- **CLAP Score (音文匹配度)**: {{clap_score}}

### 🧠 Multimodal (图文/视听多模态大模型)
- **MMMU (多学科多模态理解)**: {{mmmu_score}}
- **MathVista (视觉数学)**: {{mathvista_score}}
- **Video-MME (视频综合理解)**: {{video_score}}

## 🛠️ App / Framework 特性 (软件与展示空间专属)
- **底层模型 (Base Model)**: {{base_model_link}} # 该 App 使用的底层模型
- **核心功能 (Features)**: {{app_features}} # UI 特点、交互方式、支持的输入输出格式等
- **技术亮点 (Tech Highlights)**: {{app_tech}} # 如 WebAssembly 推理、流式处理架构、多模型切换能力等
- **易用性与集成**: {{app_integration}} # API 支持、部署脚本等

## ⚡ 部署与系统效率 (Deployment & Efficiency)
- **支持芯片 (Supported Hardware)**: {{hardware_details}} # 【新增】例: 仅支持 CUDA 核心，或通过 llama.cpp 完美支持 Apple Silicon (Metal)
- **显存消耗 (VRAM Consumption)**: {{vram_details}} # 【新增】详细说明模型加载显存、不同上下文长度的 KV Cache 占用，及 FP16/INT8/INT4 等不同量化状态下的显存梯度
- **TTFT (首字/首帧延迟)**: {{ttft}} # 流式输出体验关键
- **Throughput (吞吐量)**: {{throughput}} # Tokens/s 或 FPS
- **推荐推理框架**: {{frameworks}} # 例: vLLM, SGLang, Ollama, ComfyUI, Diffusers

## ⚖️ 综合评估
- **推理成本 ({{eval_cost}}/5)**: {{cost_note}} # 1: 必须多卡A100; 3: 单卡4090; 5: 消费级CPU/Mac可跑
- **易用度 ({{eval_ease_of_use}}/5)**: {{ease_of_use_note}} # 1: 环境配置地狱; 5: 官方提供一键包或完美接入主流生态
- **效果惊艳度 ({{eval_quality}}/5)**: {{quality_note}} # 主观体感评分

## 🚀 快速开始 / 关键代码
```python
# 核心调用代码示例 (Pipeline, vLLM 启动命令, Diffusers 推理代码等)
{{usage_code}}
```

## 🔗 关联资源
- **Hugging Face**: [{{hf_url}}]({{hf_url}})
- **论文地址**: [{{paper_url}}]({{paper_url}})
- **GitHub 仓库**: [{{github_url}}]({{github_url}})