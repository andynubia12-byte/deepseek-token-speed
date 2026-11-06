# DeepSeek Token 速度计

适用于 Chrome 和 Edge 的 Manifest V3 扩展。

## 安装

在仓库目录运行：

```sh
npm ci
npm run build
```

1. 打开 Chrome 的 `chrome://extensions`，或 Edge 的 `edge://extensions`，开启「开发者模式」。
2. 点击「加载已解压的扩展程序」，选择构建生成的 `dist` 文件夹。
3. 刷新 [DeepSeek 网页版](https://chat.deepseek.com/)并发送一条消息。会话标题右侧会显示本轮速度和总 Token 数。

## 指标

- **正文 / 思考** 分别对收到的正文和思考文本重新分词，二者相加得到总数。扩展只统计流中标记为正文或思考的文本。
- **首段** 从网页发起回复请求到浏览器收到第一段正文或思考文本的时间。
- **输出** 从收到第一段到收到最后一段正文或思考文本的时间，扣除期间网页明确标记为搜索中的时间。其他停顿仍计入输出耗时。
- **token/s** 为总数除以输出时间。全部文本在同一个网络数据块到达时，速率显示为「—」。

扩展使用 DeepSeek 官方 1017 词表在本地分词。网页分批传输文本，测速会受网络与缓冲影响。网页后端实际采用的 checkpoint 未经验证，重新分词的计数也可能与服务器统计不同。

扩展只在 `chat.deepseek.com` 页面运行，读取网页通过 fetch 或 XMLHttpRequest 收到的流式回复，计数在浏览器本地完成。扩展不上传或持久化对话。

## Tokenizer

[DeepSeek 官方 tokenizer.json](https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash-1017/blob/1bae0e1088993b9b82de08f59de5be5a34e42170/tokenizer.json)

- 模型 `deepseek-ai/DeepSeek-V4.1-Flash-1017`
- Git blob `6a15814dd25c934028034531da744c689f87ff21`
- SHA-256 `c90dfa01249db1be4245780a052ede752e1361c612ac6d08e2bdada7d599476b`
- 浏览器分词使用 [Hugging Face Tokenizers.js](https://github.com/huggingface/tokenizers.js) 0.2.0。
