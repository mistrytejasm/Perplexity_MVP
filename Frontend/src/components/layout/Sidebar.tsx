import React, { useEffect, useState } from 'react';
import { MessageSquare, Plus, Trash2 } from 'lucide-react';

interface HistoryItem {
    id: string;
    title: string;
    date: string;
}

const Sidebar = ({ currentSessionId }: { currentSessionId: string }) => {
    const [history, setHistory] = useState<HistoryItem[]>([]);

    const loadHistory = () => {
        const raw = localStorage.getItem('chat_history');
        if (raw) {
            try {
                setHistory(JSON.parse(raw));
            } catch (e) { }
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
        if (id === currentSessionId) {
            window.location.href = '/';
        }
    };

    const loadSession = (id: string) => {
        // We only swap localStorage active session ID and reload,
        // since our backend currently doesn't preserve messages for /chat_stream endpoint easily
        // without a separate history fetch.
        localStorage.setItem('perplexity_session_id', id);
        window.location.reload();
    };

    return (
        <aside className="hidden md:flex w-64 flex-col bg-gray-50 border-r border-gray-200 h-screen sticky top-0 overflow-y-auto">
            <div className="p-4">
                <button
                    onClick={() => window.location.href = '/'}
                    className="flex items-center justify-between w-full px-4 py-2 bg-white border border-gray-200 hover:bg-gray-100 rounded-lg shadow-sm text-sm font-semibold text-gray-700 transition-colors"
                >
                    <span>New Thread</span>
                    <Plus className="w-5 h-5" />
                </button>
            </div>

            <div className="px-3 pb-4 flex-1">
                <h3 className="px-3 text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">History</h3>
                <div className="space-y-1">
                    {history.length === 0 ? (
                        <p className="px-3 text-sm text-gray-400">No past threads yet.</p>
                    ) : (
                        history.map((item) => (
                            <div
                                key={item.id}
                                onClick={() => loadSession(item.id)}
                                className={`flex items-center justify-between group px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${item.id === currentSessionId ? 'bg-gray-200 text-gray-900 font-medium' : 'text-gray-600 hover:bg-gray-200/50 hover:text-gray-900'}`}
                            >
                                <div className="flex items-center space-x-3 overflow-hidden">
                                    <MessageSquare className={`w-4 h-4 flex-shrink-0 ${item.id === currentSessionId ? 'text-gray-700' : 'text-gray-400'}`} />
                                    <span className="text-sm truncate">{item.title}</span>
                                </div>
                                <button
                                    onClick={(e) => deleteSession(e, item.id)}
                                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-300 rounded text-gray-500 hover:text-red-600 transition-all flex-shrink-0"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Bottom Profile Area */}
            <div className="mt-auto p-4 border-t border-gray-200 bg-gray-50">
                <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-100 to-blue-50 flex items-center justify-center border border-indigo-200 text-indigo-600 font-bold text-sm">
                        U
                    </div>
                    <div className="flex flex-col">
                        <span className="text-sm font-medium text-gray-800">User</span>
                        <span className="text-xs text-gray-500">Free Plan</span>
                    </div>
                </div>
            </div>
        </aside>
    );
};

export default Sidebar;
