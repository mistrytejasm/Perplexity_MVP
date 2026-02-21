'use client';
import React, { useEffect, useState } from 'react';
import { MessageSquare, Plus, Trash2, PanelLeft, Clock, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface HistoryItem {
    id: string;
    title: string;
    date: string;
}

// Improvement #8: Collapsible sidebar stored in localStorage
const Sidebar = ({ currentSessionId }: { currentSessionId: string }) => {
    const [history, setHistory] = useState<HistoryItem[]>([]);
    // Improvement #8: collapsed state persisted
    const [collapsed, setCollapsed] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('sidebar_collapsed') === 'true';
        }
        return false;
    });

    const toggleCollapsed = () => {
        const next = !collapsed;
        setCollapsed(next);
        localStorage.setItem('sidebar_collapsed', String(next));
    };

    const loadHistory = () => {
        const raw = localStorage.getItem('chat_history');
        if (raw) {
            try { setHistory(JSON.parse(raw)); } catch (e) { }
        }
    };

    useEffect(() => {
        loadHistory();
        window.addEventListener('chat_history_updated', loadHistory);
        return () => window.removeEventListener('chat_history_updated', loadHistory);
    }, []);

    const deleteSession = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        const updated = history.filter(h => h.id !== id);
        setHistory(updated);
        localStorage.setItem('chat_history', JSON.stringify(updated));
        if (id === currentSessionId) window.location.href = '/';
    };

    const loadSession = (id: string) => {
        localStorage.setItem('perplexity_session_id', id);
        window.location.reload();
    };

    return (
        <motion.aside
            animate={{ width: collapsed ? 60 : 256 }}
            transition={{ type: 'spring', stiffness: 280, damping: 28 }}
            className="hidden md:flex flex-col bg-gray-50 border-r border-gray-200 h-screen sticky top-0 overflow-hidden flex-shrink-0"
        >
            {/* Top: Toggle + New Thread */}
            <div className="flex items-center p-3 gap-2 border-b border-gray-200/60">
                <button
                    onClick={toggleCollapsed}
                    className="p-2 rounded-lg hover:bg-gray-200 text-gray-500 hover:text-gray-700 transition-colors flex-shrink-0"
                    title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                >
                    <PanelLeft className="w-4 h-4" />
                </button>

                <AnimatePresence>
                    {!collapsed && (
                        <motion.button
                            initial={{ opacity: 0, width: 0 }}
                            animate={{ opacity: 1, width: 'auto' }}
                            exit={{ opacity: 0, width: 0 }}
                            onClick={() => window.location.href = '/'}
                            className="flex items-center justify-between flex-1 px-3 py-1.5 bg-white border border-gray-200 hover:bg-gray-100 rounded-lg shadow-sm text-sm font-semibold text-gray-700 transition-colors overflow-hidden whitespace-nowrap"
                        >
                            <span>New Thread</span>
                            <Plus className="w-4 h-4 flex-shrink-0" />
                        </motion.button>
                    )}
                </AnimatePresence>
            </div>

            {/* History Section */}
            <div className="flex-1 overflow-y-auto py-3 px-2">
                <AnimatePresence>
                    {!collapsed && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.15 }}
                        >
                            <div className="flex items-center space-x-1.5 px-2 mb-2">
                                <Clock className="w-3 h-3 text-gray-400" />
                                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">History</h3>
                            </div>

                            {/* Improvement #9: Empty sidebar state */}
                            {history.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                                    <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mb-3">
                                        <Search className="w-5 h-5 text-gray-400" />
                                    </div>
                                    <p className="text-sm font-medium text-gray-500 mb-1">No threads yet</p>
                                    <p className="text-xs text-gray-400 leading-relaxed">
                                        Your recent searches will appear here
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-0.5">
                                    {history.map((item) => (
                                        <div
                                            key={item.id}
                                            onClick={() => loadSession(item.id)}
                                            className={`flex items-center justify-between group px-2.5 py-2 rounded-lg cursor-pointer transition-colors ${item.id === currentSessionId
                                                ? 'bg-gray-200 text-gray-900 font-medium'
                                                : 'text-gray-600 hover:bg-gray-200/60 hover:text-gray-900'
                                                }`}
                                        >
                                            <div className="flex items-center space-x-2.5 overflow-hidden">
                                                <MessageSquare className={`w-3.5 h-3.5 flex-shrink-0 ${item.id === currentSessionId ? 'text-gray-700' : 'text-gray-400'}`} />
                                                <span className="text-sm truncate">{item.title}</span>
                                            </div>
                                            <button
                                                onClick={(e) => deleteSession(e, item.id)}
                                                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-300 rounded text-gray-500 hover:text-red-600 transition-all flex-shrink-0"
                                            >
                                                <Trash2 className="w-3 h-3" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Collapsed: icon-only history */}
                {collapsed && (
                    <div className="flex flex-col items-center space-y-1 pt-2">
                        {history.slice(0, 8).map((item) => (
                            <button
                                key={item.id}
                                onClick={() => loadSession(item.id)}
                                title={item.title}
                                className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${item.id === currentSessionId ? 'bg-gray-200' : 'hover:bg-gray-200/60'}`}
                            >
                                <MessageSquare className={`w-4 h-4 ${item.id === currentSessionId ? 'text-gray-700' : 'text-gray-500'}`} />
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Bottom Profile Area */}
            <div className="border-t border-gray-200 p-3 bg-gray-50">
                <div className={`flex items-center ${collapsed ? 'justify-center' : 'space-x-3'}`}>
                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-100 to-blue-50 flex items-center justify-center border border-indigo-200 text-indigo-600 font-bold text-sm flex-shrink-0">
                        U
                    </div>
                    <AnimatePresence>
                        {!collapsed && (
                            <motion.div
                                initial={{ opacity: 0, width: 0 }}
                                animate={{ opacity: 1, width: 'auto' }}
                                exit={{ opacity: 0, width: 0 }}
                                className="flex flex-col overflow-hidden"
                            >
                                <span className="text-sm font-medium text-gray-800 whitespace-nowrap">User</span>
                                <span className="text-xs text-gray-500 whitespace-nowrap">Free Plan</span>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </motion.aside>
    );
};

export default Sidebar;
