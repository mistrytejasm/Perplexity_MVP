'use client';
import React from 'react';
import { motion } from 'framer-motion';
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
                    // improvement #2: whileHover lift + shadow + stagger via custom delay
                    <motion.button
                        key={idx}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.15 + idx * 0.07, duration: 0.3 }}
                        whileHover={{ y: -3, boxShadow: '0 6px 20px rgba(0,0,0,0.09)', scale: 1.02 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => onSuggest(suggestion.text)}
                        className="flex items-center space-x-2 px-4 py-2 bg-white/60 border border-gray-200 hover:border-gray-300 hover:bg-white rounded-full text-sm text-gray-700 font-medium transition-colors duration-150 backdrop-blur-sm cursor-pointer"
                    >
                        {suggestion.icon}
                        <span>{suggestion.text}</span>
                    </motion.button>
                ))}
            </div>
        </div>
    );
};

export default Suggestions;
