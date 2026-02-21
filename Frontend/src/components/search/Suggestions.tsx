import React from 'react';
import { Sparkles, Code, Newspaper, BookOpen } from 'lucide-react';

interface SuggestionsProps {
    onSuggest: (query: string) => void;
}

const suggestions = [
    { text: "What are the latest breakthroughs in AI?", icon: <Newspaper className="w-4 h-4 text-blue-500" /> },
    { text: "Build a REST API with Python FastAPI", icon: <Code className="w-4 h-4 text-green-500" /> },
    { text: "Explain quantum computing simply", icon: <Sparkles className="w-4 h-4 text-purple-500" /> },
    { text: "History of the Roman Empire", icon: <BookOpen className="w-4 h-4 text-orange-500" /> }
];

const Suggestions: React.FC<SuggestionsProps> = ({ onSuggest }) => {
    return (
        <div className="mt-8 flex flex-col items-center w-full">
            <div className="flex flex-wrap items-center justify-center gap-2.5 max-w-2xl px-4">
                {suggestions.map((suggestion, idx) => (
                    <button
                        key={idx}
                        onClick={() => onSuggest(suggestion.text)}
                        className="flex items-center space-x-2 px-4 py-2 bg-white/50 border border-gray-200 hover:border-gray-300 hover:bg-white hover:shadow-sm rounded-full text-sm text-gray-700 font-medium transition-all duration-200 backdrop-blur-sm"
                    >
                        {suggestion.icon}
                        <span>{suggestion.text}</span>
                    </button>
                ))}
            </div>
        </div>
    );
};

export default Suggestions;
