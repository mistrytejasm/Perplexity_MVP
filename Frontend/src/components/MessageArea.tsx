import React, { useRef, useEffect, useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { motion, AnimatePresence } from 'framer-motion';
import { Globe, FileText, CheckCircle2, CircleDashed, Loader2, Sparkles } from 'lucide-react';


const PremiumTypingAnimation = () => {
    return (
        <div className="flex items-center space-x-2 text-gray-400 py-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm font-medium">Thinking...</span>
        </div>
    );
};

// Premium Perplexity-style Sources Display
const SearchStages = ({ searchInfo, onSourceClick }: { searchInfo: any, onSourceClick?: (source: any, allSources: any[]) => void }) => {
    const [isExpanded, setIsExpanded] = useState(true);

    if (!searchInfo || !searchInfo.stages || searchInfo.stages.length === 0) return null;

    // Combine web and document sources
    const allSources = [
        ...(searchInfo.webSources || []).map((s: any, idx: number) => ({ ...s, type: 'web', index: idx + 1 })),
        ...(searchInfo.documentSources || []).map((s: any, idx: number) => ({ ...s, type: 'doc', index: (searchInfo.webSources?.length || 0) + idx + 1 }))
    ];

    const isSearching = searchInfo.stages.includes('searching') && !searchInfo.stages.includes('writing');

    // Auto-collapse after search finishes
    useEffect(() => {
        if (!isSearching) {
            const timer = setTimeout(() => setIsExpanded(false), 500); // Faster collapse to match Perplexity
            return () => clearTimeout(timer);
        } else {
            setIsExpanded(true);
        }
    }, [isSearching]);

    return (
        <div className="mb-4 mt-0 w-full">
            {/* Status Header (Clickable to toggle) */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex items-center space-x-2 text-sm text-gray-500 mb-2 font-medium hover:text-gray-800 transition-colors focus:outline-none"
            >
                {isSearching ? (
                    <div className="flex items-center space-x-2 text-blue-600">
                        <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                        <span>Searching {searchInfo.source === 'documents' ? 'documents' : searchInfo.source === 'hybrid' ? 'knowledge base' : 'web'}...</span>
                    </div>
                ) : (
                    <div className="flex items-center text-gray-700 hover:text-gray-900 transition-colors bg-gray-50/80 px-2 py-1.5 rounded-md">
                        <CheckCircle2 className="w-4 h-4 text-gray-400 mr-2" />
                        <span className="font-semibold text-sm mr-2">Sources</span>
                        {allSources.length > 0 && (
                            <span className="text-xs text-gray-500 bg-gray-200/60 border border-gray-200/80 px-1.5 py-0.5 rounded-full">{allSources.length}</span>
                        )}
                    </div>
                )}
            </button>

            {/* Collapsible Content */}
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                    >
                        {/* Status Steps when Searching */}
                        {isSearching && (
                            <div className="mb-4 pl-1 space-y-2 flex flex-col border-l-2 border-gray-100 ml-1.5 py-1">
                                <motion.div
                                    initial={{ opacity: 0, x: -5 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    className="flex items-center text-sm text-gray-500 pl-4"
                                >
                                    <Sparkles className="w-3.5 h-3.5 mr-2 text-indigo-400" />
                                    <span>Understanding query...</span>
                                </motion.div>
                                {searchInfo.subQueries && searchInfo.subQueries.map((sq: string, idx: number) => (
                                    <motion.div
                                        key={`sq-${idx}`}
                                        initial={{ opacity: 0, x: -5 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: idx * 0.1 }}
                                        className="flex items-center text-sm text-gray-700 pl-4 font-medium"
                                    >
                                        <Globe className="w-3.5 h-3.5 mr-2 text-blue-400" />
                                        <span>Searching: {sq}</span>
                                    </motion.div>
                                ))}
                                {searchInfo.stages.includes('reading') && (
                                    <motion.div
                                        initial={{ opacity: 0, x: -5 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        className="flex items-center text-sm text-gray-500 pl-4"
                                    >
                                        <FileText className="w-3.5 h-3.5 mr-2 text-teal-500" />
                                        <span>Reading {Math.max(1, allSources.length)} sources...</span>
                                    </motion.div>
                                )}
                            </div>
                        )}

                        {/* Sources Grid (Perplexity Style Cards) */}
                        {allSources.length > 0 && (
                            <div className="flex flex-wrap gap-2 mb-2 pb-2 mt-1">
                                {allSources.map((source: any, index: number) => (
                                    <motion.div
                                        onClick={() => onSourceClick && onSourceClick(source, allSources)}
                                        rel="noopener noreferrer"
                                        initial={{ opacity: 0, scale: 0.95, y: 5 }}
                                        animate={{ opacity: 1, scale: 1, y: 0 }}
                                        transition={{ delay: index * 0.05 }}
                                        key={`source-${index}`}
                                        className="flex-shrink-0 w-40 bg-white border border-gray-200 rounded-lg p-2.5 shadow-sm hover:shadow-md hover:border-gray-300 hover:bg-gray-50 transition-all cursor-pointer group no-underline block"
                                    >
                                        <div className="flex items-center space-x-1.5 mb-1.5">
                                            <div className="w-4 h-4 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center flex-shrink-0">
                                                {source.type === 'web' ? <Globe className="w-2.5 h-2.5" /> : <FileText className="w-2.5 h-2.5" />}
                                            </div>
                                            <span className="text-[11px] text-gray-500 truncate font-semibold w-full">
                                                {source.domain || (source.url && source.url.startsWith('http') ? new URL(source.url).hostname.replace('www.', '') : 'Website')}
                                            </span>
                                        </div>
                                        <div className="text-xs text-gray-800 font-medium line-clamp-2 leading-snug group-hover:text-blue-600 transition-colors h-8">
                                            {source.title || source.filename || "Source Document"}
                                        </div>
                                        {/* Citation Number Badge */}
                                        <div className="mt-1 flex items-center">
                                            <span className="inline-flex items-center justify-center min-w-[16px] h-[16px] text-[10px] bg-gray-100 text-gray-500 rounded-full font-bold">
                                                {index + 1}
                                            </span>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
// Enhanced markdown parser with FIXED syntax
const parseMarkdown = (content: string, searchInfo?: any, onSourceClick?: (source: any, allSources: any[]) => void) => {
    if (!content) return content;

    // Clean up the content first
    let cleanContent = content
        .replace(/^\|[-\s:]+\|$/gm, '')
        .replace(/^[-\s]+$/gm, '')
        .replace(/\n\s*\n\s*\n/g, '\n\n')
        .trim();

    const lines = cleanContent.split('\n');
    const parsed: React.ReactNode[] = [];
    let listItems: string[] = [];
    let inList = false;
    let tableRows: string[][] = [];
    let inTable = false;
    let tableHeaders: string[] = [];
    let codeBlock: string[] = [];
    let inCodeBlock = false;
    let codeLanguage = '';

    const flushList = () => {
        if (listItems.length > 0) {
            parsed.push(
                <ul key={`list-${parsed.length}`} className="list-none space-y-2 mb-4 ml-0">
                    {listItems.map((item, idx) => (
                        <li key={idx} className="flex items-start">
                            <span className="text-teal-500 mr-3 mt-0.5 flex-shrink-0 text-sm">- </span>
                            <span className="text-gray-700 leading-relaxed text-sm">{formatInlineMarkdown(item)}</span>
                        </li>
                    ))}
                </ul>
            );
            listItems = [];
        }
        inList = false;
    };

    const flushTable = () => {
        if (tableRows.length > 0) {
            parsed.push(
                <div key={`table-${parsed.length}`} className="overflow-x-auto w-full mb-6 mt-4">
                    <table className="w-full text-left border-collapse rounded-xl overflow-hidden ring-1 ring-gray-200">
                        {tableHeaders.length > 0 && (
                            <thead className="bg-gray-50/80">
                                <tr>
                                    {tableHeaders.map((header, idx) => (
                                        <th key={idx} className="px-4 py-3 text-sm font-semibold text-gray-700 border-b border-gray-200">
                                            {formatInlineMarkdown(header.trim())}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                        )}
                        <tbody className="bg-white">
                            {tableRows.map((row, rowIdx) => (
                                <tr key={rowIdx} className="hover:bg-gray-50/50 transition-colors border-b border-gray-100 last:border-0">
                                    {row.map((cell, cellIdx) => (
                                        <td key={cellIdx} className="px-4 py-3 text-sm text-gray-700 align-top">
                                            {formatInlineMarkdown(cell.trim())}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            );
            tableRows = [];
            tableHeaders = [];
        }
        inTable = false;
    };

    // 🔧 FIXED: Flush code blocks with syntax highlighting
    const flushCodeBlock = () => {
        if (codeBlock.length > 0) {
            const codeString = codeBlock.join('\n');
            parsed.push(
                <div key={`code-${parsed.length}`} className="relative mb-6 rounded-lg overflow-hidden border border-gray-200 shadow-sm group">
                    {/* Language label */}
                    {codeLanguage && (
                        <div className="bg-gray-800 text-gray-200 text-xs px-3 py-1 font-mono">
                            {codeLanguage}
                        </div>
                    )}

                    {/* Code block with syntax highlighting */}
                    <SyntaxHighlighter
                        language={codeLanguage || 'text'}
                        style={vscDarkPlus}
                        showLineNumbers={codeString.split('\n').length > 3}
                        wrapLines={true}
                        customStyle={{
                            margin: 0,
                            fontSize: '14px',
                            lineHeight: '1.5',
                            padding: '16px'
                        }}
                    >
                        {codeString}
                    </SyntaxHighlighter>

                    {/* Copy button */}
                    <button
                        className="absolute top-2 right-2 p-2 rounded-md bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white transition-colors opacity-0 group-hover:opacity-100"
                        onClick={() => navigator.clipboard.writeText(codeString)}
                        title="Copy code"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                    </button>
                </div>
            );
            codeBlock = [];
            codeLanguage = '';
        }
        inCodeBlock = false;
    };

    const formatInlineMarkdown = (text: string): React.ReactNode => {
        if (!text) return <span></span>;

        // Combine web and document sources to resolve citations to URLs
        const allSources = searchInfo ? [
            ...(searchInfo.webSources || []).map((s: any) => ({ ...s, type: 'web' })),
            ...(searchInfo.documentSources || []).map((s: any) => ({ ...s, type: 'doc' }))
        ] : [];

        const processStyleFormatting = (textChunk: string, keyPrefix: string): (string | React.ReactNode)[] => {
            const results: (string | React.ReactNode)[] = [];
            const inlineRegex = /(\*\*[^*]+\*\*)|(\*[^*]+\*)|(`[^`]+`)/g;
            let lastIdx = 0;
            let inlineMatch;

            while ((inlineMatch = inlineRegex.exec(textChunk)) !== null) {
                // Add text before match
                if (inlineMatch.index > lastIdx) {
                    results.push(textChunk.substring(lastIdx, inlineMatch.index));
                }

                if (inlineMatch[1]) {
                    // Bold: **text**
                    results.push(
                        <strong key={`${keyPrefix}-bold-${inlineMatch.index}`} className="font-semibold text-gray-900">
                            {inlineMatch[1].slice(2, -2)}
                        </strong>
                    );
                } else if (inlineMatch[2]) {
                    // Italic: *text*
                    results.push(
                        <em key={`${keyPrefix}-italic-${inlineMatch.index}`} className="italic">
                            {inlineMatch[2].slice(1, -1)}
                        </em>
                    );
                } else if (inlineMatch[3]) {
                    // Inline code: `code`
                    results.push(
                        <code key={`${keyPrefix}-code-${inlineMatch.index}`} className="bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded text-sm font-mono">
                            {inlineMatch[3].slice(1, -1)}
                        </code>
                    );
                }

                lastIdx = inlineRegex.lastIndex;
            }

            // Add remaining text
            if (lastIdx < textChunk.length) {
                results.push(textChunk.substring(lastIdx));
            }

            return results;
        };

        // Process each element for inline formatting
        const processInlineFormatting = (textChunk: string, keyPrefix: number): (string | React.ReactNode)[] => {
            if (!textChunk || typeof textChunk !== 'string') return [textChunk];

            const results: (string | React.ReactNode)[] = [];

            // Pattern for Citations: [1], [2], etc
            const citationRegex = /\[(\d+|Source\s*\d+|Web\s*\d+|Document\s*\d+)\]/gi;

            let lastIndex = 0;
            let match;

            while ((match = citationRegex.exec(textChunk)) !== null) {
                // Add text before match
                if (match.index > lastIndex) {
                    const preText = textChunk.substring(lastIndex, match.index);
                    // recursively format bold/italic for this text
                    results.push(...processStyleFormatting(preText, `${keyPrefix}-${lastIndex}`));
                }

                const citationText = match[1];
                const numberMatch = citationText.match(/\d+/);
                const citationNumber = numberMatch ? parseInt(numberMatch[0], 10) : null;

                let sourceUrl = undefined;
                let actualSource = null;
                if (citationNumber && citationNumber > 0 && citationNumber <= allSources.length) {
                    actualSource = allSources[citationNumber - 1];
                    sourceUrl = actualSource?.url;
                }

                if (actualSource) {
                    results.push(
                        <button
                            key={`citation-${keyPrefix}-${match.index}`}
                            onClick={() => onSourceClick && onSourceClick(actualSource, allSources)}
                            className="inline-flex items-center justify-center min-w-[20px] px-[5px] h-[18px] text-[10px] bg-blue-50 text-blue-600 rounded-full ring-1 ring-blue-200/60 hover:bg-blue-100 hover:text-blue-800 transition-colors mx-0.5 cursor-pointer font-semibold relative -top-0.5 no-underline"
                            title={`Source ${citationNumber}`}
                        >
                            {citationNumber}
                        </button>
                    );
                } else {
                    results.push(
                        <span
                            key={`citation-${keyPrefix}-${match.index}`}
                            className="inline-flex items-center justify-center min-w-[20px] px-[5px] h-[18px] text-[10px] bg-gray-100/80 text-gray-600 rounded-full ring-1 ring-gray-200/60 hover:bg-gray-200 hover:text-gray-900 transition-colors mx-0.5 cursor-pointer font-semibold relative -top-0.5"
                            title={`Source ${citationNumber}`}
                        >
                            {citationNumber}
                        </span>
                    );
                }

                lastIndex = citationRegex.lastIndex;
            }

            if (lastIndex < textChunk.length) {
                results.push(...processStyleFormatting(textChunk.substring(lastIndex), `${keyPrefix}-${lastIndex}`));
            }

            return results;
        };

        return <span>{processInlineFormatting(text, 0)}</span>;
    };


    lines.forEach((line, index) => {
        const trimmed = line.trim();

        // 🔧 FIXED: Handle code block fences with proper syntax
        if (trimmed.startsWith('```')) {
            if (inCodeBlock) {
                // End code block
                flushCodeBlock();
            } else {
                // Start code block
                flushList();
                flushTable();
                inCodeBlock = true;
                // Extract language from javascript, etc.
                codeLanguage = trimmed.slice(3).trim() || 'text';
            }
            return;
        }

        // If we're in a code block, collect the lines
        if (inCodeBlock) {
            codeBlock.push(line);
            return;
        }

        // Skip empty lines or separator lines
        if (!trimmed || /^[-\s|:]+$/.test(trimmed)) {
            return;
        }

        // Handle table rows
        if (trimmed.includes('|') && trimmed.split('|').length > 2) {
            const cells = trimmed.split('|').map(cell => cell.trim()).filter(cell => cell.length > 0);
            if (cells.length > 0) {
                if (!inTable) {
                    flushList();
                    inTable = true;
                    tableHeaders = cells;
                } else {
                    tableRows.push(cells);
                }
                return;
            }
        } else {
            flushTable();
        }

        // Handle headers
        if (trimmed.startsWith('## ')) {
            flushList();
            flushTable();
            parsed.push(
                <h2 key={`h2-${index}`} className="text-lg font-bold text-gray-900 mb-3 mt-6 first:mt-0 pb-2 border-b border-gray-200">
                    {formatInlineMarkdown(trimmed.slice(3))}
                </h2>
            );
        } else if (trimmed.startsWith('### ')) {
            flushList();
            flushTable();
            parsed.push(
                <h3 key={`h3-${index}`} className="text-base font-semibold text-gray-800 mb-2 mt-5 first:mt-0">
                    {formatInlineMarkdown(trimmed.slice(4))}
                </h3>
            );
        } else if (trimmed.startsWith('#### ')) {
            flushList();
            flushTable();
            parsed.push(
                <h4 key={`h4-${index}`} className="text-sm font-medium text-gray-800 mb-2 mt-4 first:mt-0">
                    {formatInlineMarkdown(trimmed.slice(5))}
                </h4>
            );
        }
        // Add asterisk pattern detection
        else if (trimmed.startsWith('* ') || trimmed.startsWith('• ') || trimmed.startsWith('- ') || /^\d+\.\s/.test(trimmed)) {
            flushTable();
            inList = true;
            const itemText = trimmed.replace(/^[•\-\*]\s/, '').replace(/^\d+\.\s/, '');
            listItems.push(itemText);
        }

        // Handle regular paragraphs
        else if (trimmed.length > 0) {
            flushList();
            flushTable();
            parsed.push(
                <p key={`p-${index}`} className="text-gray-700 mb-3 leading-relaxed text-sm">
                    {formatInlineMarkdown(trimmed)}
                </p>
            );
        }
    });

    // Flush any remaining items
    flushList();
    flushTable();
    flushCodeBlock();

    return <div className="space-y-1.5 text-gray-800 break-words">{parsed}</div>;
};

interface Message {
    id: number;
    content: string;
    isUser: boolean;
    type: string;
    isLoading?: boolean;
    searchInfo?: any;
}
interface MessageAreaProps {
    messages: Message[];
    onSourceClick?: (source: any, allSources: any[]) => void;
}
const MessageArea: React.FC<MessageAreaProps> = ({ messages, onSourceClick }) => {

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [isAtBottom, setIsAtBottom] = useState(true);
    const [showScrollButton, setShowScrollButton] = useState(false);

    // Auto-scroll function
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({
            behavior: 'smooth',
            block: 'end'
        });
    };

    // Manual scroll to bottom (for button)
    const scrollToBottomInstant = () => {
        messagesEndRef.current?.scrollIntoView({
            behavior: 'smooth',
            block: 'end'
        });
        setShowScrollButton(false);
    };

    // Check if user is at bottom
    const handleScroll = () => {
        if (containerRef.current) {
            const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
            const atBottom = scrollHeight - scrollTop - clientHeight < 50;
            setIsAtBottom(atBottom);
            setShowScrollButton(!atBottom && messages.length > 3);
        }
    };

    // Auto-scroll whenever messages change (only if at bottom)
    useEffect(() => {
        if (isAtBottom) {
            setTimeout(scrollToBottom, 100);
        }
    }, [messages, isAtBottom]);

    // Auto-scroll when message content updates (streaming)
    useEffect(() => {
        const lastMessage = messages[messages.length - 1];
        if (lastMessage && !lastMessage.isUser && isAtBottom) {
            scrollToBottom();
        }
    }, [messages, isAtBottom]);

    return (
        // <div className="bg-[#FCFCF8] px-4 py-6">

        <div
            ref={containerRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto bg-white px-4 py-8 relative scroll-smooth"
        >
            <div className="max-w-[768px] mx-auto w-full">
                <AnimatePresence initial={false}>
                    {messages.map((message) => (
                        <motion.div
                            initial={{ opacity: 0, y: 15 }}
                            animate={{ opacity: 1, y: 0 }}
                            key={`msg-${message.id}`}
                            className="mb-8"
                        >
                            {/* USER MESSAGE - Big bold text */}
                            {message.isUser ? (
                                <div className="flex justify-end w-full mb-8">
                                    <div className="max-w-[85%] bg-gray-100/60 border border-gray-100 px-5 py-4 rounded-3xl rounded-br-md shadow-sm">
                                        <p className="text-gray-900 text-[16px] font-medium leading-relaxed whitespace-pre-wrap">{message.content}</p>
                                    </div>
                                </div>
                            ) : (
                                /* AI MESSAGE - Document flow */
                                <div className="flex w-full group">
                                    {/* Left Icon - FIXED POSITION FOR ALL AI CONTENT */}
                                    <div className="flex-shrink-0 mr-4 mt-1">
                                        <div className="w-8 h-8 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center opacity-80 group-hover:opacity-100 transition-opacity shadow-sm">
                                            <Sparkles className="w-4 h-4 text-indigo-500" />
                                        </div>
                                    </div>

                                    {/* Right Content Column */}
                                    <div className="flex-1 min-w-0 flex flex-col pt-1">

                                        {/* Sources Row */}
                                        {message.searchInfo && message.searchInfo.stages.length > 0 && (
                                            <SearchStages searchInfo={message.searchInfo} onSourceClick={onSourceClick} />
                                        )}

                                        {/* Answer Content */}
                                        {message.isLoading && !message.content && !message.searchInfo?.stages?.includes('searching') ? (
                                            <PremiumTypingAnimation />
                                        ) : message.content ? (
                                            <div className="prose prose-sm md:prose-base max-w-none prose-p:leading-relaxed prose-pre:bg-gray-900 prose-pre:text-gray-100 prose-headings:font-bold prose-headings:text-gray-900 prose-a:text-blue-600 text-gray-800 break-words w-full">
                                                {parseMarkdown(message.content, message.searchInfo, onSourceClick)}
                                                {message.isLoading && (
                                                    <span className="inline-block w-2.5 h-4 ml-1 mb-0.5 align-middle bg-indigo-400 animate-pulse rounded-sm"></span>
                                                )}
                                            </div>
                                        ) : null}
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    ))}
                </AnimatePresence>

                {/* Extra bottom spacing so last message isn't hidden behind fixed input */}
                <div className="h-6"></div>
                <div ref={messagesEndRef} />
            </div>
            {/* ADD SCROLL TO BOTTOM BUTTON */}
            {showScrollButton && (
                <button
                    onClick={scrollToBottomInstant}
                    className="fixed bottom-24 right-8 w-12 h-12 bg-white border border-gray-200 rounded-full shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center z-20 hover:bg-gray-50"
                    title="Scroll to bottom"
                >
                    <svg
                        className="w-5 h-5 text-gray-600"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                    </svg>
                </button>
            )}
        </div>
    );
};

export default MessageArea;