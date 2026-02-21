import React, { useRef, useEffect, useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { motion, AnimatePresence } from 'framer-motion';
import { Globe, FileText, CheckCircle2, CircleDashed, Loader2, Sparkles, Plus, Copy, Check, ThumbsUp, ThumbsDown, AlertTriangle } from 'lucide-react';
import SourceCard from './SourceCard';


// Improvement #7: 3-dot bouncing typing indicator
const TypingDots = () => (
    <div className="flex items-center space-x-1.5 py-3 px-1">
        <div className="typing-dot w-2.5 h-2.5 rounded-full bg-indigo-400"></div>
        <div className="typing-dot w-2.5 h-2.5 rounded-full bg-indigo-400"></div>
        <div className="typing-dot w-2.5 h-2.5 rounded-full bg-indigo-400"></div>
    </div>
);

// Improvement #6: real-time source card reveal + sub-query list during search
const SearchSkeleton = ({ searchInfo, onSourceClick }: { searchInfo?: any; onSourceClick?: (source: any, allSources: any[]) => void }) => {
    const subQueries: string[] = searchInfo?.subQueries || [];
    const source: string = searchInfo?.source || 'web';
    const stages: string[] = searchInfo?.stages || [];
    const isReading = stages.includes('reading');
    const sourceLabel = source === 'documents' ? 'documents' : source === 'hybrid' ? 'knowledge base & web' : 'web';

    // Real sources already arrived via SSE stream
    const arrivedSources = [
        ...(searchInfo?.webSources || []).map((s: any, idx: number) => ({ ...s, type: 'web', index: idx + 1 })),
        ...(searchInfo?.documentSources || []).map((s: any, idx: number) => ({ ...s, type: 'doc', index: (searchInfo?.webSources?.length || 0) + idx + 1 }))
    ];

    return (
        <div className="space-y-3 mb-4">
            {/* Step-by-step sub-query list */}
            <div className="space-y-2 mb-3">
                <motion.div
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-center space-x-2.5"
                >
                    <Loader2 className="w-4 h-4 animate-spin text-blue-500 flex-shrink-0" />
                    <span className="text-sm text-gray-500 font-medium">Searching {sourceLabel}...</span>
                </motion.div>

                {subQueries.map((sq, idx) => (
                    <motion.div
                        key={`sq-${idx}`}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.1 + idx * 0.1 }}
                        className="flex items-start space-x-2.5 pl-1"
                    >
                        <Globe className="w-3.5 h-3.5 text-blue-400 flex-shrink-0 mt-0.5" />
                        <span className="text-sm text-gray-700 font-medium leading-snug">{sq}</span>
                    </motion.div>
                ))}

                {isReading && (
                    <motion.div
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex items-center space-x-2.5 pl-1"
                    >
                        <FileText className="w-3.5 h-3.5 text-teal-500 flex-shrink-0" />
                        <span className="text-sm text-gray-500">Reading sources...</span>
                    </motion.div>
                )}
            </div>

            {/* Real-time source cards — appear one by one as SSE pushes them */}
            <div className="flex overflow-x-auto gap-3 pb-2 -mx-1 px-1 scrollbar-hide">
                <AnimatePresence>
                    {arrivedSources.map((src, idx) => (
                        <motion.div
                            key={src.url || src.filename || idx}
                            initial={{ opacity: 0, scale: 0.88, x: 12 }}
                            animate={{ opacity: 1, scale: 1, x: 0 }}
                            exit={{ opacity: 0, scale: 0.88 }}
                            transition={{ type: 'spring', stiffness: 280, damping: 22, delay: idx * 0.04 }}
                            className="flex-shrink-0"
                        >
                            <SourceCard
                                source={src}
                                index={idx}
                                allSources={arrivedSources}
                                onClick={onSourceClick}
                            />
                        </motion.div>
                    ))}
                </AnimatePresence>

                {/* Trailing shimmer placeholders — always show 2 to signal more coming */}
                {[0, 1].map(i => (
                    <div
                        key={`shimmer-${i}`}
                        className="flex-shrink-0 w-44 h-[88px] rounded-xl skeleton-shimmer"
                    />
                ))}
            </div>
        </div>
    );
};

// Improvement #12: word-by-word streaming reveal via CSS animation
const WordByWord = ({ text }: { text: string }) => {
    const words = text.split(' ');
    return (
        <>
            {words.map((word, i) => (
                <span
                    key={i}
                    className="inline-block"
                    style={{
                        animation: `slideUp 0.25s cubic-bezier(0.16,1,0.3,1) both`,
                        animationDelay: `${Math.min(i * 0.018, 0.8)}s`
                    }}
                >
                    {word}{i < words.length - 1 ? '\u00a0' : ''}
                </span>
            ))}
        </>
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

    // Keep sources expanded while searching, collapse slightly after done (but user can re-open)
    useEffect(() => {
        if (isSearching) {
            setIsExpanded(true);
        }
        // Do NOT auto-collapse — let users read and click the sources
    }, [isSearching]);

    return (
        <div className="mb-4 mt-0 w-full">
            {isSearching ? (
                // Pass searchInfo + click handler so cards are interactive in real-time
                <SearchSkeleton searchInfo={searchInfo} onSourceClick={onSourceClick} />
            ) : (
                <>
                    {/* Sources header - clickable to toggle */}
                    <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="flex items-center space-x-2 text-sm mb-2 font-medium hover:text-gray-800 transition-colors focus:outline-none group"
                    >
                        <div className="flex items-center text-gray-700 hover:text-gray-900 transition-colors bg-gray-50/80 px-2.5 py-1.5 rounded-lg border border-gray-200/60 group-hover:border-gray-300">
                            <CheckCircle2 className="w-4 h-4 text-emerald-500 mr-2" />
                            <span className="font-semibold text-sm mr-2">Sources</span>
                            {allSources.length > 0 && (
                                <span className="text-xs text-gray-500 bg-gray-200/60 border border-gray-200/80 px-1.5 py-0.5 rounded-full">
                                    {allSources.length}
                                </span>
                            )}
                            <svg
                                className={`w-3.5 h-3.5 ml-1.5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                fill="none" viewBox="0 0 24 24" stroke="currentColor"
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </div>
                    </button>

                    {/* Source cards - horizontally scrollable */}
                    <AnimatePresence>
                        {isExpanded && allSources.length > 0 && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.25 }}
                                className="overflow-hidden"
                            >
                                <div className="flex overflow-x-auto gap-3 pb-3 mt-2 scrollbar-hide -mx-1 px-1">
                                    {allSources.map((source: any, index: number) => (
                                        <SourceCard
                                            key={`source-${index}`}
                                            source={source}
                                            index={index}
                                            allSources={allSources}
                                            onClick={onSourceClick}
                                        />
                                    ))}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </>
            )}
        </div>
    );
};
// Enhanced markdown parser with FIXED syntax
const parseMarkdown = (content: string, searchInfo?: any, onSourceClick?: (source: any, allSources: any[]) => void) => {
    if (!content) return content;

    // Clean up the content first + normalize any leaked non-standard citation formats
    let cleanContent = content
        .replace(/^\|[-\s:]+\|$/gm, '')
        .replace(/^[-\s]+$/gm, '')
        .replace(/\n\s*\n\s*\n/g, '\n\n')
        // Normalize 【N†L1-L3】or 【N】→ [N] (OpenAI file-search format leak)
        .replace(/\u3010(\d+)(?:\u2020[^\u3011]*)?\u3011/g, '[$1]')
        // Normalize 《N†...》 variant
        .replace(/\u300a(\d+)(?:\u2020[^\u300b]*)?\u300b/g, '[$1]')
        // Strip stray dagger+line refs like †L1-L5
        .replace(/\u2020L\d+-L\d+/g, '')
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

            // Combined regex: markdown links [text](url) | plain citations [1] | bold **x** | italic *x* | code `x`
            const combinedRegex = /\[([^\]]+)\]\(([^)]+)\)|\[(\d+)\](?!\()|\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`/g;

            let lastIndex = 0;
            let match;

            while ((match = combinedRegex.exec(textChunk)) !== null) {
                // Text before this match
                if (match.index > lastIndex) {
                    results.push(textChunk.substring(lastIndex, match.index));
                }

                if (match[1] !== undefined && match[2] !== undefined) {
                    // === Markdown link: [text](url) ===
                    const linkText = match[1];
                    const linkUrl = match[2];
                    const citationNum = /^\d+$/.test(linkText) ? parseInt(linkText, 10) : null;

                    if (citationNum && citationNum > 0) {
                        // It's a numbered citation — find matching source
                        const matchedSource = allSources[citationNum - 1] || allSources.find((s: any) => s.url === linkUrl) || null;

                        if (matchedSource && onSourceClick) {
                            // Clickable badge that opens source panel
                            results.push(
                                <button
                                    key={`cit-${keyPrefix}-${match.index}`}
                                    onClick={() => onSourceClick(matchedSource, allSources)}
                                    className="inline-flex items-center justify-center min-w-[20px] px-[5px] h-[18px] text-[10px] bg-blue-50 text-blue-600 rounded-full ring-1 ring-blue-200/60 hover:bg-blue-100 hover:text-blue-800 transition-colors mx-0.5 cursor-pointer font-semibold relative -top-0.5"
                                    title={matchedSource.domain || matchedSource.url || `Source ${citationNum}`}
                                >
                                    {citationNum}
                                </button>
                            );
                        } else {
                            // Open URL directly in new tab
                            results.push(
                                <a
                                    key={`cit-${keyPrefix}-${match.index}`}
                                    href={linkUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center justify-center min-w-[20px] px-[5px] h-[18px] text-[10px] bg-gray-100 text-gray-600 rounded-full ring-1 ring-gray-200/60 hover:bg-gray-200 hover:text-gray-800 transition-colors mx-0.5 cursor-pointer font-semibold relative -top-0.5"
                                    title={`Source ${citationNum}`}
                                >
                                    {citationNum}
                                </a>
                            );
                        }
                    } else {
                        // Non-numbered markdown link — render as regular link
                        results.push(
                            <a
                                key={`link-${keyPrefix}-${match.index}`}
                                href={linkUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:underline"
                            >
                                {linkText}
                            </a>
                        );
                    }
                } else if (match[3] !== undefined) {
                    // === Plain citation [N] (fallback, backend may not always process) ===
                    const citNum = parseInt(match[3], 10);
                    const src = citNum > 0 && citNum <= allSources.length ? allSources[citNum - 1] : null;
                    if (src && onSourceClick) {
                        results.push(
                            <button
                                key={`pcit-${keyPrefix}-${match.index}`}
                                onClick={() => onSourceClick(src, allSources)}
                                className="inline-flex items-center justify-center min-w-[20px] px-[5px] h-[18px] text-[10px] bg-blue-50 text-blue-600 rounded-full ring-1 ring-blue-200/60 hover:bg-blue-100 hover:text-blue-800 transition-colors mx-0.5 cursor-pointer font-semibold relative -top-0.5"
                                title={src.domain || `Source ${citNum}`}
                            >
                                {citNum}
                            </button>
                        );
                    } else {
                        results.push(
                            <span
                                key={`pcit-${keyPrefix}-${match.index}`}
                                className="inline-flex items-center justify-center min-w-[20px] px-[5px] h-[18px] text-[10px] bg-gray-100 text-gray-600 rounded-full ring-1 ring-gray-200/60 mx-0.5 font-semibold relative -top-0.5"
                            >
                                {citNum}
                            </span>
                        );
                    }
                } else if (match[4] !== undefined) {
                    // Bold **text**
                    results.push(<strong key={`b-${keyPrefix}-${match.index}`} className="font-semibold text-gray-900">{match[4]}</strong>);
                } else if (match[5] !== undefined) {
                    // Italic *text*
                    results.push(<em key={`i-${keyPrefix}-${match.index}`} className="italic">{match[5]}</em>);
                } else if (match[6] !== undefined) {
                    // Inline code `code`
                    results.push(<code key={`c-${keyPrefix}-${match.index}`} className="bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded text-sm font-mono">{match[6]}</code>);
                }

                lastIndex = combinedRegex.lastIndex;
            }

            // Remaining text after last match
            if (lastIndex < textChunk.length) {
                results.push(textChunk.substring(lastIndex));
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
    onSuggestionClick?: (query: string) => void;
}
const MessageArea: React.FC<MessageAreaProps> = ({ messages, onSourceClick, onSuggestionClick }) => {

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    // Track whether the user has manually scrolled up (don't steal scroll back)
    const userScrolledUp = useRef(false);
    const prevMessagesLen = useRef(0);
    const [showScrollButton, setShowScrollButton] = useState(false);
    // Improvement #1: tracks which message id was just copied
    const [copiedId, setCopiedId] = useState<number | null>(null);

    const handleCopy = (id: number, text: string) => {
        navigator.clipboard.writeText(text);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    // The single source-of-truth scroll function — uses scrollTop directly to avoid scrollIntoView jank
    const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
        const el = containerRef.current;
        if (!el) return;
        el.scrollTo({ top: el.scrollHeight, behavior });
    };

    // Detect user manually scrolling
    const handleScroll = () => {
        const el = containerRef.current;
        if (!el) return;
        const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
        const atBottom = distFromBottom < 60;
        userScrolledUp.current = !atBottom;
        setShowScrollButton(!atBottom && messages.length > 1);
    };

    // When a NEW user message is added: always force-scroll immediately (instant)
    // When streaming content arrives: scroll only if user hasn't scrolled up
    useEffect(() => {
        const newLen = messages.length;
        const lastMsg = messages[newLen - 1];

        // A new message was added (user sent a query or AI reply started)
        if (newLen > prevMessagesLen.current) {
            prevMessagesLen.current = newLen;
            userScrolledUp.current = false; // reset user intent on new query
            // instant jump for user messages, smooth for AI start
            scrollToBottom(lastMsg?.isUser ? 'instant' : 'smooth');
            return;
        }

        // Streaming update on the last AI message — only scroll if user hasn't scrolled away
        if (!userScrolledUp.current) {
            scrollToBottom('instant'); // instant during streaming prevents rubber-band lag
        }
    }, [messages]);

    return (
        // <div className="bg-[#FCFCF8] px-4 py-6">

        <div
            ref={containerRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto bg-white px-4 py-8 relative scroll-smooth"
        >
            {/* Improvement #11: Sticky mini-header shows last query when scrolled up */}
            {showScrollButton && (() => {
                const lastUserMsg = [...messages].reverse().find(m => m.isUser);
                return lastUserMsg ? (
                    <div className="sticky top-0 z-10 mb-4 -mx-4 px-4 py-2 bg-white/92 backdrop-blur-sm border-b border-gray-100 flex items-center justify-between">
                        <p className="text-sm font-medium text-gray-700 truncate max-w-[80%]">
                            {lastUserMsg.content}
                        </p>
                        <button
                            onClick={() => { userScrolledUp.current = false; scrollToBottom('smooth'); setShowScrollButton(false); }}
                            className="text-xs text-indigo-500 hover:text-indigo-700 font-semibold ml-2 flex-shrink-0 transition-colors"
                        >
                            ↓ Latest
                        </button>
                    </div>
                ) : null;
            })()}
            <div className="max-w-[768px] mx-auto w-full">
                <AnimatePresence initial={false}>
                    {messages.map((message, index) => {
                        // improvement #13: show separator between conversation turns
                        const prevMsg = messages[index - 1];
                        const showSeparator = index > 0 && message.isUser && prevMsg && !prevMsg.isUser;
                        return (
                            <React.Fragment key={`frag-${message.id}`}>
                                {/* Improvement #13: Thread separator line */}
                                {showSeparator && (
                                    <div className="flex items-center gap-3 my-4 px-2">
                                        <div className="flex-1 h-px bg-gray-100" />
                                        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">New query</span>
                                        <div className="flex-1 h-px bg-gray-100" />
                                    </div>
                                )}
                                <motion.div
                                    initial={{ opacity: 0, y: 15 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    key={`msg-${message.id}`}
                                    className={`mb-8 message-slide-up`}
                                >
                                    {/* USER MESSAGE */}
                                    {message.isUser ? (
                                        <div className="flex justify-end w-full mb-8">
                                            <div className="max-w-[85%] bg-gray-100/60 border border-gray-100 px-5 py-4 rounded-3xl rounded-br-md shadow-sm">
                                                <p className="text-gray-900 text-[16px] font-medium leading-relaxed whitespace-pre-wrap">{message.content}</p>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex w-full group">
                                            <div className="flex-1 min-w-0 flex flex-col pt-1">

                                                {/* Sources Row */}
                                                {message.searchInfo && message.searchInfo.stages.length > 0 && (
                                                    <SearchStages searchInfo={message.searchInfo} onSourceClick={onSourceClick} />
                                                )}

                                                {/* Answer Header — show as soon as writing stage starts or content exists */}
                                                {(message.content ||
                                                    message.searchInfo?.stages?.includes('writing') ||
                                                    (message.isLoading && !message.searchInfo?.stages?.includes('searching'))
                                                ) && (
                                                        <div className="flex items-center space-x-2 mt-4 mb-2">
                                                            <svg className="w-5 h-5 text-indigo-500" fill="none" viewBox="0 0 24 24">
                                                                <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                                                            </svg>
                                                            <h3 className="text-lg font-semibold text-gray-900 tracking-tight font-sans">Answer</h3>
                                                        </div>
                                                    )}

                                                {/* Answer Content */}
                                                {message.searchInfo?.stages?.includes('error') ? (
                                                    <div className="bg-red-50 text-red-700 p-4 rounded-xl border border-red-100 flex items-start space-x-3 mb-2">
                                                        <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                                                        <div>
                                                            <p className="font-semibold text-[13px] tracking-tight text-red-900">Failed to generate answer</p>
                                                            <p className="text-[12px] text-red-600/90 mt-1 leading-relaxed">
                                                                {message.searchInfo.error || message.content || "A connection error occurred while communicating with the AI. Please try again."}
                                                            </p>
                                                        </div>
                                                    </div>
                                                ) : (message.isLoading || message.searchInfo?.stages?.includes('writing')) && !message.content ? (
                                                    // improvement #7: 3-dot bouncing indicator — shows during writing stage before first token
                                                    <TypingDots />
                                                ) : message.content ? (
                                                    <div className="prose prose-sm md:prose-base max-w-none prose-p:leading-relaxed prose-pre:bg-gray-900 prose-pre:text-gray-100 prose-headings:font-bold prose-headings:text-gray-900 prose-a:text-blue-600 text-gray-800 break-words w-full">
                                                        {parseMarkdown(message.content, message.searchInfo, onSourceClick)}
                                                        {message.isLoading && (
                                                            <span className="inline-block w-2.5 h-4 ml-1 mb-[2px] align-middle bg-indigo-500 animate-[pulse_0.75s_cubic-bezier(0.4,0,0.6,1)_infinite] rounded-sm shadow-sm"></span>
                                                        )}
                                                    </div>
                                                ) : null}

                                                {/* Action Bar (Copy / Feedback) */}
                                                {!message.isLoading && message.content && (
                                                    <div className="mt-2.5 flex items-center space-x-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button
                                                            onClick={() => handleCopy(message.id, message.content)}
                                                            className={`flex items-center space-x-1 p-1.5 rounded-md transition-all text-sm ${copiedId === message.id
                                                                ? 'text-green-600 bg-green-50'
                                                                : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'
                                                                }`}
                                                            title="Copy response"
                                                        >
                                                            {copiedId === message.id ? (
                                                                <><Check className="w-4 h-4" /><span className="text-xs font-medium">Copied!</span></>
                                                            ) : (
                                                                <Copy className="w-4 h-4" />
                                                            )}
                                                        </button>
                                                        <button className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-md transition-colors">
                                                            <ThumbsUp className="w-4 h-4" />
                                                        </button>
                                                        <button className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors">
                                                            <ThumbsDown className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                )}

                                                {/* Follow-up Suggestions at bottom of last response */}
                                                {!message.isLoading && message.content && index === messages.length - 1 && (
                                                    <motion.div
                                                        initial={{ opacity: 0, y: 10 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        transition={{ delay: 0.3 }}
                                                        className="mt-6 flex flex-col space-y-2 border-t border-gray-100 pt-4"
                                                    >
                                                        <div className="flex items-center text-sm font-medium text-gray-500 mb-1">
                                                            <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                            </svg>
                                                            Related
                                                        </div>
                                                        {/* Use subQueries from backend if available, fallback to hardcoded ideas */}
                                                        {(message.searchInfo?.subQueries?.length ? message.searchInfo.subQueries.slice(0, 3) : ["Tell me more about this", "What are the alternatives?", "How does this work technically?"]).map((q: string, idx: number) => (
                                                            <button
                                                                key={`followup-${idx}`}
                                                                onClick={() => onSuggestionClick && onSuggestionClick(q)}
                                                                className="text-left px-4 py-2.5 bg-gray-50/80 hover:bg-gray-100 border border-gray-100 hover:border-gray-200 rounded-xl text-[13px] font-medium text-gray-700 transition-colors flex items-center justify-between group"
                                                            >
                                                                <span>{q}</span>
                                                                <Plus className="w-4 h-4 text-gray-400 group-hover:text-indigo-500 transition-colors" />
                                                            </button>
                                                        ))}
                                                    </motion.div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </motion.div>
                            </React.Fragment>
                        );
                    })}
                </AnimatePresence>

                {/* Extra bottom spacing so last message isn't hidden behind fixed input */}
                <div className="h-6"></div>
                <div ref={messagesEndRef} />
            </div>
            {/* ADD SCROLL TO BOTTOM BUTTON */}
            {
                showScrollButton && (
                    <button
                        onClick={() => { userScrolledUp.current = false; scrollToBottom('smooth'); setShowScrollButton(false); }}
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
                )
            }
        </div >
    );
};

export default MessageArea;