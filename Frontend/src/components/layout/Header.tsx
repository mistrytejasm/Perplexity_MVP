import { Sparkles, Plus, User } from 'lucide-react';
import React from 'react';

const Header = () => {
    return (
        <header className="sticky top-0 w-full h-14 bg-white/90 backdrop-blur-md border-b border-gray-100 z-40 flex items-center justify-between px-4 sm:px-6">
            {/* Left: Logo */}
            <div
                className="flex items-center space-x-2 cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => window.location.href = '/'}
            >
                <div className="w-8 h-8 bg-gray-900 rounded-lg flex items-center justify-center">
                    <Sparkles className="w-4 h-4 text-white" />
                </div>
                <span className="font-semibold text-gray-800 text-lg tracking-tight hidden sm:block font-sans">
                    Perplexity MVP
                </span>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center space-x-3 sm:space-x-4">
                <button
                    onClick={() => window.location.href = '/'}
                    className="flex items-center space-x-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 border border-gray-200 rounded-full transition-all shadow-sm hover:shadow"
                >
                    <Plus className="w-4 h-4" />
                    <span className="hidden sm:inline">New Thread</span>
                </button>
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-100 to-blue-50 flex items-center justify-center border border-indigo-200 cursor-pointer hover:shadow-sm transition-all">
                    <User className="w-4 h-4 text-indigo-600" />
                </div>
            </div>
        </header>
    );
};

export default Header;