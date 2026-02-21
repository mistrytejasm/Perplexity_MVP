---
title: Perplexity MVP
emoji: 🔍
colorFrom: blue
colorTo: purple
sdk: docker
app_port: 7860
pinned: false
license: mit
---

# 🔍 Perplexity MVP

AI-powered search and document Q&A system built with FastAPI and React.

## Features

- 🌐 **Web Search**: Powered by Tavily API
- 📄 **Document Q&A**: Upload PDFs and ask questions
- 🤖 **AI-Powered**: Uses Groq LLM and sentence transformers
- ⚡ **Real-time Streaming**: Live response generation
- 🔒 **Session Management**: Document isolation per session

## API Endpoints

- `GET /` - Health check
- `GET /chat_stream` - Streaming chat endpoint
- `POST /documents/upload` - Upload documents
- `POST /documents/search` - Search in documents
- `GET /health` - Detailed health check

## Usage

1. **Web Search**: Send queries to `/chat_stream`
2. **Document Upload**: POST files to `/documents/upload`
3. **Document Q&A**: Include `session_id` in chat queries

## Environment Variables

Set these in HuggingFace Spaces Settings:

- `GROQ_API_KEY` - Your Groq API key
- `TAVILY_API_KEY` - Your Tavily API key

## Tech Stack

- **Backend**: FastAPI + Python 3.12
- **AI/ML**: sentence-transformers, LangChain, Groq
- **Vector DB**: ChromaDB
- **Search**: Tavily API
- **Deployment**: HuggingFace Spaces (Docker)
