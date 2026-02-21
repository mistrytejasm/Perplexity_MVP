import { useState, useEffect } from 'react';

export interface SearchInfo {
    stages: string[];
    query: string;
    source: string;
    subQueries: string[];
    urls: string[];
    sources: string[];
    webSources: any[];
    documentSources: any[];
    error?: string;
}

export interface Message {
    id: number;
    content: string;
    isUser: boolean;
    type: string;
    isLoading?: boolean;
    searchInfo?: SearchInfo;
}

const generateSessionId = () => 'session_' + Date.now();

export const useChat = () => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [currentMessage, setCurrentMessage] = useState("");
    const [checkpointId, setCheckpointId] = useState<string | null>(null);
    const [hasStartedChat, setHasStartedChat] = useState(false);
    const [sessionId, setSessionId] = useState('');
    const [documents, setDocuments] = useState<any[]>([]);
    const [showDocuments, setShowDocuments] = useState(false);
    const [selectedSourceData, setSelectedSourceData] = useState<{ source?: any, allSources: any[] } | null>(null);

    useEffect(() => {
        const existingSession = localStorage.getItem('perplexity_session_id');
        if (existingSession) {
            setSessionId(existingSession);
        } else {
            const newSession = generateSessionId();
            setSessionId(newSession);
            localStorage.setItem('perplexity_session_id', newSession);
        }
    }, []);

    const loadDocuments = async () => {
        if (!sessionId) return;
        try {
            const response = await fetch(`http://localhost:8000/documents/session/${sessionId}`);
            const data = await response.json();
            setDocuments(data.documents || []);
        } catch (error) {
            console.error('Error loading documents:', error);
        }
    };

    useEffect(() => {
        if (sessionId) {
            loadDocuments();
        }
    }, [sessionId]);

    const handleRemoveDocument = async (documentId: string) => {
        try {
            await fetch(`http://localhost:8000/documents/${documentId}?session_id=${sessionId}`, {
                method: 'DELETE'
            });
            loadDocuments(); // Refresh document list
        } catch (error) {
            console.error('Error removing document:', error);
        }
    };

    const mergeSearchInfo = (existing: SearchInfo | undefined, newData: any): SearchInfo => {
        const merged: SearchInfo = {
            stages: [...(existing?.stages || [])],
            query: existing?.query || "",
            source: existing?.source || "",
            subQueries: [...(existing?.subQueries || [])],
            urls: [...(existing?.urls || [])],
            sources: [...(existing?.sources || [])],
            webSources: [...(existing?.webSources || [])],
            documentSources: [...(existing?.documentSources || [])],
            error: existing?.error
        };

        if (newData.type && !merged.stages.includes(newData.type)) {
            if (newData.type === 'search_start') merged.stages.push('searching');
            if (newData.type === 'query_breakdown') merged.stages.push('searching');
            if (newData.type === 'search_results') merged.stages.push('reading');
            if (newData.type === 'end') merged.stages.push('writing');
            if (newData.type === 'search_error') merged.stages.push('error');
        }

        if (newData.query) merged.query = newData.query;
        if (newData.original_query) merged.query = newData.original_query;
        if (newData.source) merged.source = newData.source;

        if (newData.sub_queries) {
            newData.sub_queries.forEach((sq: string) => {
                if (!merged.subQueries.includes(sq)) {
                    merged.subQueries.push(sq);
                }
            });
        }

        if (newData.web_sources) {
            newData.web_sources.forEach((ws: any) => {
                if (!merged.webSources.find(existing => existing.url === ws.url)) {
                    merged.webSources.push(ws);
                }
            });
        }

        if (newData.document_sources) {
            newData.document_sources.forEach((ds: any) => {
                if (!merged.documentSources.find(existing => existing.filename === ds.filename)) {
                    merged.documentSources.push(ds);
                }
            });
        }

        if (newData.urls) {
            const urlsArray = typeof newData.urls === 'string' ? JSON.parse(newData.urls) : newData.urls;
            urlsArray.forEach((url: string) => {
                if (!merged.urls.includes(url)) {
                    merged.urls.push(url);
                }
            });

            urlsArray.forEach((url: string) => {
                const domain = url.split('//')[1]?.split('/')[0] || 'unknown';
                if (!merged.webSources.find(ws => ws.url === url)) {
                    merged.webSources.push({ url, domain });
                }
            });
        }

        if (newData.sources) {
            newData.sources.forEach((source: string) => {
                if (!merged.sources.includes(source)) {
                    merged.sources.push(source);
                }
            });

            newData.sources.forEach((source: string) => {
                if (!merged.documentSources.find(ds => ds.filename === source)) {
                    merged.documentSources.push({ filename: source });
                }
            });
        }

        if (newData.error) merged.error = newData.error;

        return merged;
    };

    const submitQuery = async (queryText: string) => {
        if (queryText.trim()) {
            if (!hasStartedChat) {
                setHasStartedChat(true);
                setTimeout(() => {
                    loadDocuments();
                }, 100);
            }

            const newMessageId = messages.length > 0 ? Math.max(...messages.map(msg => msg.id)) + 1 : 1;
            setMessages(prev => [
                ...prev,
                {
                    id: newMessageId,
                    content: queryText,
                    isUser: true,
                    type: 'message'
                }
            ]);

            const userInput = queryText;
            setCurrentMessage("");

            try {
                const aiResponseId = newMessageId + 1;
                setMessages(prev => [
                    ...prev,
                    {
                        id: aiResponseId,
                        content: "",
                        isUser: false,
                        type: 'message',
                        isLoading: true,
                        searchInfo: {
                            stages: [],
                            query: "",
                            source: "",
                            subQueries: [],
                            urls: [],
                            sources: [],
                            webSources: [],
                            documentSources: []
                        }
                    }
                ]);

                let url = `http://localhost:8000/chat_stream?message=${encodeURIComponent(userInput)}&session_id=${sessionId}`;
                if (checkpointId) url += `&checkpoint_id=${encodeURIComponent(checkpointId)}`;

                const eventSource = new EventSource(url);
                let streamedContent = "";

                eventSource.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);

                        if (data.type === 'checkpoint') {
                            setCheckpointId(data.checkpoint_id);
                        }
                        else if (data.type === 'search_start') {
                            setMessages(prev =>
                                prev.map(msg =>
                                    msg.id === aiResponseId
                                        ? {
                                            ...msg,
                                            searchInfo: {
                                                stages: ['searching'],
                                                query: data.query,
                                                source: 'controlled',
                                                subQueries: [],
                                                urls: [],
                                                sources: [],
                                                webSources: [],
                                                documentSources: []
                                            }
                                        }
                                        : msg
                                )
                            );
                        }
                        else if (data.type === 'query_generated') {
                            setMessages(prev =>
                                prev.map(msg =>
                                    msg.id === aiResponseId
                                        ? {
                                            ...msg,
                                            searchInfo: {
                                                ...msg.searchInfo!,
                                                stages: ['searching'],
                                                query: data.query_type === 'original' ? data.query : msg.searchInfo?.query || "",
                                                subQueries: data.query_type === 'sub_query'
                                                    ? [...(msg.searchInfo?.subQueries || []), data.query]
                                                    : (msg.searchInfo?.subQueries || [])
                                            }
                                        }
                                        : msg
                                )
                            );
                        }
                        else if (data.type === 'reading_start') {
                            setMessages(prev =>
                                prev.map(msg =>
                                    msg.id === aiResponseId
                                        ? {
                                            ...msg,
                                            searchInfo: {
                                                ...msg.searchInfo!,
                                                stages: [...(msg.searchInfo?.stages || []), 'reading']
                                            }
                                        }
                                        : msg
                                )
                            );
                        }
                        else if (data.type === 'source_found') {
                            setMessages(prev =>
                                prev.map(msg =>
                                    msg.id === aiResponseId
                                        ? {
                                            ...msg,
                                            searchInfo: {
                                                ...msg.searchInfo!,
                                                webSources: [
                                                    ...(msg.searchInfo?.webSources || []),
                                                    data.source
                                                ].filter((source, index, arr) =>
                                                    arr.findIndex(s => s.url === source.url) === index
                                                )
                                            }
                                        }
                                        : msg
                                )
                            );
                        }
                        else if (data.type === 'writing_start') {
                            setMessages(prev =>
                                prev.map(msg =>
                                    msg.id === aiResponseId
                                        ? {
                                            ...msg,
                                            searchInfo: {
                                                ...msg.searchInfo!,
                                                stages: [...(msg.searchInfo?.stages || []), 'writing']
                                            }
                                        }
                                        : msg
                                )
                            );
                        }
                        else if (data.type === 'content') {
                            streamedContent += data.content;
                            setMessages(prev =>
                                prev.map(msg =>
                                    msg.id === aiResponseId
                                        ? { ...msg, content: streamedContent, isLoading: false }
                                        : msg
                                )
                            );
                        }
                        else if (data.type === 'end') {
                            setMessages(prev =>
                                prev.map(msg =>
                                    msg.id === aiResponseId
                                        ? { ...msg, isLoading: false }
                                        : msg
                                )
                            );
                            eventSource.close();
                        }
                    } catch (error) {
                        console.error("Error parsing event data:", error);
                    }
                };

                eventSource.onerror = (error) => {
                    console.error("EventSource error:", error);
                    eventSource.close();
                    if (!streamedContent) {
                        setMessages(prev =>
                            prev.map(msg =>
                                msg.id === aiResponseId
                                    ? {
                                        ...msg,
                                        content: "Sorry, there was an error processing your request.",
                                        isLoading: false,
                                        searchInfo: mergeSearchInfo(msg.searchInfo, {
                                            type: 'search_error',
                                            error: "Connection error"
                                        })
                                    }
                                    : msg
                            )
                        );
                    }
                };

            } catch (error) {
                console.error("Error setting up EventSource:", error);
                setMessages(prev => [
                    ...prev,
                    {
                        id: newMessageId + 1,
                        content: "Sorry, there was an error connecting to the server.",
                        isUser: false,
                        type: 'message',
                        isLoading: false,
                        searchInfo: {
                            stages: ['error'],
                            query: "",
                            source: "",
                            subQueries: [],
                            urls: [],
                            sources: [],
                            webSources: [],
                            documentSources: [],
                            error: "Connection failed"
                        }
                    }
                ]);
            }
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        submitQuery(currentMessage);
    };

    return {
        messages,
        currentMessage,
        setCurrentMessage,
        hasStartedChat,
        sessionId,
        documents,
        showDocuments,
        setShowDocuments,
        selectedSourceData,
        setSelectedSourceData,
        loadDocuments,
        handleRemoveDocument,
        handleSubmit,
        submitQuery
    };
};
