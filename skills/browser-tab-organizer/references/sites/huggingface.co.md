# Hugging Face (huggingface.co)

This guide defines the specialized workflow for classifying and archiving AI models, technical blogs, and showcase spaces from Hugging Face.

## 1. Modality Classification
When scanning Hugging Face tabs, categorize entities into:
- **LLM**: Large Language Models (General, Coding, Chat).
- **Vision**: Image/Video understanding (Object detection, segmentation, classification).
- **Image**: Image generation or editing (T2I, I2I, In-painting).
- **ASR**: Automatic Speech Recognition (Speech-to-text).
- **TTS**: Text-to-Speech (Voice synthesis).
- **Audio**: Audio understanding or non-speech generation (Music, sound effects).
- **Multimodal**: Models handling vision and language (VLM, Video-MME).
- **App/Framework**: Interactive applications (Spaces) or deployment libraries (Transformers.js).

## 2. Archival Workflow
Follow these steps strictly for each type of content:

### A. AI Models (Model Cards)
1. **Focus**: ALWAYS run `switch-to-tab(tabId)` before processing.
2. **Extraction**: 
   - Use `get-tab-markdown-content` as the primary tool.
   - **Stability Retry**: Only use `reload-browser-tab` if the initial extraction fails (e.g., connection lost).
3. **Metadata Mapping**:
   - **Family**: Identify the model family (e.g., Qwen 3, Llama 3, Stable Diffusion).
   - **Parameters**: Total and active parameters (for MoE).
   - **Resources**: Peak VRAM required and supported hardware (NVIDIA GPU, Apple Silicon, CPU).
4. **Modality-Specific Metrics**:
   - **LLM**: MMLU, HumanEval, MBPP.
   - **Vision**: mAP, F1-Score, Accuracy.
   - **Image**: FID, CLIP Score, Aesthetic Score.
   - **ASR**: WER, CER.
   - **TTS**: MOS, Speaker Similarity.
   - **Audio/Multimodal**: MMMU, Video-MME, CLAP Score.

### B. Showcase Spaces (Demos)
1. **Discovery**: Look for "Models" or "GitHub" links on the landing page.
2. **README Deep-Dive**:
   - Locate README link via `find-element(query: "a[href*='/blob/main/README.md']")`.
   - **Raw Fetching**: Construct the raw link by replacing `/blob/` with **`/raw/`** (e.g., `https://huggingface.co/spaces/{user}/{name}/raw/main/README.md`).
   - **Download & Parse**: Use `fetch-url` to download the raw README and `read_file` to parse YAML metadata for `base_model`, `SDK`, and `paper_url`.
3. **Action Strategy**:
   - **Archive Framework**: If the value is in the app tech (e.g., WebAssembly, WebGPU), archive with `modality: App/Framework`.
   - **Append Info**: If the core model is already archived, **append** specific info (e.g., BibTeX, related model lists) to the existing note using `create-obsidian-note(append: true)`.

### C. Technical Blogs (Articles)
1. **Extraction**: Extract the full content using `get-tab-markdown-content`.
2. **Content**: Ensure the note includes: `Abstract`, `Key Points`, `Code Snippets`, and `Benchmarking`.
3. **Storage**: Save to **`Clippings/`**.

## 3. Storage Standards
- **AI Models / Apps**: 
  - **Template**: Use **`references/templates/AI.md`**.
  - **Path**: `Library/AI-Models/{{Organization}} · {{Name}}.md`.
- **Technical Blogs**: 
  - **Path**: `Clippings/{{Title}}.md`.
- **Courses / Books**: 
  - **Template**: Use **`references/templates/Book.md`**.
  - **Path**: `Library/Books/{{Organization}} · {{Name}}.md`.

## 4. Cleanup
- Close the tab immediately after the Obsidian note or clipping is successfully created or appended.
